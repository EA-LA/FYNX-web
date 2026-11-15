'use strict';
// Fixed, individually reviewed artwork. It is context, never a photograph of
// the reported event or a claim that the publisher supplied/licensed an image.
// Rights/source metadata verified 2026-11-15 against the Commons file page.
const NVIDIA=Object.freeze({
 url:'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0f/NVIDIA_Headquarters.jpg/1280px-NVIDIA_Headquarters.jpg',
 width:1280,height:783,kind:'context',source:'Wikimedia Commons',
 sourcePage:'https://commons.wikimedia.org/wiki/File:NVIDIA_Headquarters.jpg',
 credit:'Coolcaesar / Wikimedia Commons; perspective corrected and cropped by Jacek Halicki — CC BY-SA 4.0',
 license:'CC BY-SA 4.0',licenseURL:'https://creativecommons.org/licenses/by-sa/4.0/',
 caption:'Context image: NVIDIA headquarters in Santa Clara, California, photographed in 2018.'
});
function forArticle(item,{articleID,sourceURL,expiresAt}){
 if(!/\b(?:nvidia|NVDA)\b/i.test(String(item.title||'')+' '+String(item.description||'')))return null;
 return {...NVIDIA,articleID,sourceURL,expiresAt:new Date(expiresAt).toISOString()};
}
module.exports={forArticle,NVIDIA};
