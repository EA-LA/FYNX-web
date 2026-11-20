"""Rebuild tests/kronos: tiny random-weight Kronos tokenizers and models, saved in the Hugging Face format
(config.json + model.safetensors) with reference outputs from the official PyTorch code.

Usage: python3 -I scripts/kronos/make-reference.py <path to a clone of github.com/shiyu-coder/Kronos> <output dir>
Needs torch, numpy, pandas, einops, huggingface_hub and safetensors. scripts/test-kronos-engine.cjs checks the
JavaScript engine against these files.
"""
import sys, json, os
sys.path.insert(0, os.path.abspath(sys.argv[1]))
import numpy as np, torch, pandas as pd
from model.kronos import Kronos, KronosTokenizer, auto_regressive_inference, calc_time_stamps
torch.manual_seed(7); np.random.seed(7)
OUT = sys.argv[2]
for variant, learn_te in [('fixed', False), ('learned', True)]:
    tok = KronosTokenizer(d_in=6, d_model=48, n_heads=4, ff_dim=96, n_enc_layers=3, n_dec_layers=3, ffn_dropout_p=0, attn_dropout_p=0, resid_dropout_p=0, s1_bits=6, s2_bits=6, beta=0.05, gamma0=1.0, gamma=1.1, zeta=0.05, group_size=4).eval()
    mdl = Kronos(s1_bits=6, s2_bits=6, n_layers=3, d_model=64, n_heads=4, ff_dim=128, ffn_dropout_p=0, attn_dropout_p=0, resid_dropout_p=0, token_dropout_p=0, learn_te=learn_te).eval()
    # randomise RMSNorm weights and biases so every parameter matters in the comparison
    with torch.no_grad():
        for m in list(tok.modules()) + list(mdl.modules()):
            for n, p in m.named_parameters(recurse=False):
                if n in ('weight', 'bias') and p.requires_grad and p.dim() == 1: p.add_(torch.randn_like(p) * 0.1)
    tok.save_pretrained(f'{OUT}/{variant}/tokenizer'); mdl.save_pretrained(f'{OUT}/{variant}/model')
    L, H = 40, 6
    t = pd.date_range('2026-03-02 09:30', periods=L + H, freq='h')
    price = 100 * np.exp(np.cumsum(np.random.randn(L) * 0.01))
    o = price * (1 + np.random.randn(L) * 0.002); c = price; hi = np.maximum(o, c) * 1.004; lo = np.minimum(o, c) * 0.996; v = np.random.rand(L) * 1e6
    df = pd.DataFrame({'open': o, 'high': hi, 'low': lo, 'close': c, 'volume': v})
    df['amount'] = df['volume'] * df[['open', 'high', 'low', 'close']].mean(axis=1)
    x = df.values.astype(np.float32); mean, std = x.mean(0), x.std(0)
    xn = np.clip((x - mean) / (std + 1e-5), -5, 5)
    xs = calc_time_stamps(pd.Series(t[:L])).values.astype(np.float32); ys = calc_time_stamps(pd.Series(t[L:])).values.astype(np.float32)
    with torch.no_grad():
        X = torch.from_numpy(xn[None]); s1, s2 = tok.encode(X, half=True)
        z = tok.decode([s1, s2], half=True)[0].numpy()
        logits1, ctx = mdl.decode_s1(s1, s2, torch.from_numpy(xs[None]))
        pick = logits1[:, -1, :].argmax(-1, keepdim=True)
        logits2 = mdl.decode_s2(ctx, pick)[:, -1, :]
        preds = auto_regressive_inference(tok, mdl, torch.from_numpy(xn[None]), torch.from_numpy(xs[None]), torch.from_numpy(ys[None]), 512, H, clip=5, T=1.0, top_k=1, top_p=1.0, sample_count=1)
    ref = {'raw': df.values.tolist(), 'xn': xn.tolist(), 'mean': mean.tolist(), 'std': std.tolist(), 'x_stamp': xs.tolist(), 'y_stamp': ys.tolist(),
           's1': s1[0].tolist(), 's2': s2[0].tolist(), 'decoded': z.tolist(), 'logits1_last': logits1[0, -1].tolist(), 'pick': int(pick[0, 0]), 'logits2_last': logits2[0].tolist(),
           'greedy_preds': (preds[0, -H:] * (std + 1e-5) + mean).tolist(), 'H': H}
    json.dump(ref, open(f'{OUT}/{variant}/ref.json', 'w'))
    print(variant, 'tokenizer params', sum(p.numel() for p in tok.parameters()), 'model params', sum(p.numel() for p in mdl.parameters()), 's1[:8]', s1[0, :8].tolist())
