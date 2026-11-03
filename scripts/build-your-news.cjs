/* Build the device-local personal newsroom without changing existing account saves. */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'news/your-news.html');
const styles=['terminal-shell','terminal-header','newsroom','your-news'];
const scripts=['newsroom-editions','news-reader-links','news-preferences','market-intelligence-data','terminal-market-data','journal-theme','terminal-header','terminal-market-ui','newsroom-media','your-news'];
const navigation=[['Home','/home.html'],['Journal','/journal.html'],['Calculator','/calculator.html'],['News','/news.html'],['Calendar','/calendar.html'],['Learn','/learn.html'],['Explore','/explore.html'],['Research','/tools/research-desk.html'],['Profile','/profile.html']];
const html=`<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your News — Follow Topics &amp; Continue Reading | FYNX Finance World</title>
<meta name="description" content="Build your FYNX front page around the topics you follow. Current reporting for your selected edition, search and unread filters, and your recent reading in one place.">
<link rel="canonical" href="https://www.fynxfinanceworld.com/news/your-news.html">
<meta property="og:type" content="website"><meta property="og:title" content="Your News | FYNX Finance World"><meta property="og:description" content="Your topics. Your edition. A clearer view of today's reporting."><meta property="og:url" content="https://www.fynxfinanceworld.com/news/your-news.html"><meta property="og:image" content="https://www.fynxfinanceworld.com/assets/social/fynx-resources.png"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon-32x32.png"><script src="/assets/js/site-theme-init.js"></script>
<link rel="stylesheet" href="/assets/discovery.css?v=20261103-r1">
${styles.map(name=>`<link rel="stylesheet" href="/assets/css/${name}.css?v=20261103-r1">`).join('\n')}
${scripts.map(name=>`<script src="/assets/js/${name}.js?v=20261103-r1" defer></script>`).join('\n')}
</head>
<body data-fynx-layout="standalone" data-fynx-terminal class="newsroom-page your-news-page">
<a class="newsroom-skip" href="#your-news-main">Skip to Your News</a>
<header class="discovery-header"><a class="discovery-brand" href="/" aria-label="FYNX Finance World home">FYNX<span>FINANCE WORLD</span></a><nav aria-label="Account and appearance"><a href="/profile.html">Account</a><button type="button" data-theme-control data-journal-theme><span data-theme-label>Dark theme</span> ◐</button></nav></header>
<nav class="terminal-navigation" aria-label="Workspace navigation">${navigation.map(([title,href])=>`<a href="${href}">${title}</a>`).join('')}</nav>
<main id="your-news-main" class="newsroom-main" data-your-news>
<nav class="newsroom-breadcrumb" aria-label="Breadcrumb"><a href="/news.html">Newsroom</a><span aria-hidden="true">/</span><span aria-current="page">Your News</span></nav>
<header class="newsroom-heading"><div><p class="newsroom-kicker">FYNX / YOUR PERSONAL FRONT PAGE</p><h1>Your News</h1><p class="newsroom-deck">Follow what matters to you.<br>Fresh reporting, a clearer brief, and a place to pick up where you left off.</p></div><div class="newsroom-edition-context"><span data-your-edition>Selected edition</span><p>Use the edition selector above<br>to change your regional coverage.</p></div></header>
<section class="your-news-topics" aria-labelledby="your-topics-title"><div class="newsroom-section-rule"><h2 id="your-topics-title">Choose your topics</h2><span data-your-topic-count></span></div><div class="your-news-topic-buttons" data-your-topics aria-label="Follow news topics"></div><p data-your-storage class="your-news-storage">Your topic choices and reading history stay in this browser.</p></section>
<div class="newsroom-toolbar"><div><span class="newsroom-status-label" data-your-status-title>Checking sources</span><p data-your-status role="status" aria-live="polite">Loading reporting for your interests.</p></div><button type="button" data-your-refresh>Refresh coverage ↻</button></div>
<div class="your-news-layout"><section class="your-news-reporting" aria-label="Your followed reporting">
<form class="your-news-filters" role="search" data-your-filter-form><label class="your-news-search">Search your coverage<input type="search" data-your-search placeholder="Company, topic or publisher" autocomplete="off" maxlength="120"></label><label>Topic<select data-your-topic-filter><option value="all">All followed topics</option></select></label><label>Order<select data-your-sort><option value="top">Top reporting</option><option value="latest">Newest first</option></select></label><label class="your-news-unread"><input type="checkbox" data-your-unread> Unread only</label></form>
<div class="newsroom-section-rule"><h2>Your briefing</h2><span data-your-results>Checking reports</span></div>
<div data-your-stories aria-busy="true"></div>
<div class="your-news-empty" data-your-empty><span class="newsroom-kicker">MAKE IT YOURS</span><h2 data-your-empty-title>Checking your followed topics.</h2><p data-your-empty-copy>Choose one or more topics above to build your front page.</p><button type="button" data-your-reset-filters>Clear search &amp; filters</button><a href="/news.html">Browse all news →</a></div>
<button type="button" class="newsroom-more" data-your-more hidden>Show more reports</button>
</section>
<aside class="your-news-rail" aria-label="Reading history and research">
<section class="your-news-history"><div class="newsroom-section-rule"><h2>Continue reading</h2><button type="button" data-your-clear-history hidden>Clear history</button></div><p class="your-news-rail-intro">Recently opened briefs, saved on this device for up to seven days.</p><div data-your-history><p class="your-news-empty-note">Open a FYNX brief to build your reading history here.</p></div></section>
<section class="your-news-method"><p class="newsroom-kicker">THE FYNX APPROACH</p><h2>Context before the click away.</h2><p>Every report opens a FYNX brief with available source details, explained terms and original-source access.</p><a href="/news.html">Explore the newsroom →</a></section>
<section class="your-news-workbench"><div class="newsroom-section-rule"><h2>Turn reading into research</h2></div><a href="/tools/symbol-news.html"><strong>Follow a company →</strong><span>Find reporting for a symbol or company.</span></a><a href="/calendar.html"><strong>Plan around the calendar →</strong><span>Check economic releases and policy events.</span></a><a href="/tools/research-desk.html"><strong>Check the underlying facts →</strong><span>Compare company filings and market data.</span></a></section>
</aside></div>
<details class="newsroom-method"><summary>How Your News works</summary><p>Your chosen topics and edition determine the feeds requested. Top reporting follows the source feed's ranking; Newest first uses publication time. Current feeds contain reports from the past 24 hours and check for updates every five minutes while this page is visible. They also refresh when you change topics or edition.</p><p>Unread means you have not opened that report in this browser's recorded history. Your preferences stay in this browser. Up to 60 recently opened briefs remain in its history for up to seven days; they do not sync to an account. Clear history removes the local reading list. Your existing research saves and membership remain separate.</p><p>Coverage can be empty or partially refreshed when a source is unavailable. FYNX does not fill those gaps with invented reporting. Publication times, source names and available evidence appear with the reporting.</p></details>
<noscript><p class="newsroom-feed-message">Enable JavaScript to follow topics and load current reports. You can also browse the <a href="/news.html">newsroom</a> and <a href="/calendar.html">economic calendar</a>.</p></noscript>
</main><footer class="newsroom-footer"><a href="/">FYNX <span>FINANCE WORLD</span></a><nav aria-label="Footer"><a href="/news.html">Newsroom</a><a href="/tools/research-desk.html">Research</a><a href="/contact.html">Contact</a><a href="/risk-disclosure.html">Risk disclosure</a></nav><p>Reporting, sources and tools for your own research.</p></footer>
</body></html>`;
fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,html);console.log('Built Your News personal newsroom.');
module.exports={pages:['news/your-news.html']};
