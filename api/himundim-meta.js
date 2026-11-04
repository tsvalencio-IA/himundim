const ALLOWED=new Set([
  "home",
  "bts-em-sp-show-impecavel-com-organizacao-desastrosa",
  "amae-festival-2026-maior-edicao-historia-rio-preto",
  "riopreto-shopping-abertura-natal-2026",
  "jetour-s08-suv-hibrido-7-lugares",
  "cnh-do-brasil-pedagio-eletronico-evitar-golpes",
  "afroturismo-no-brasil-roteiros",
  "chef-dom-aula-show-senac-rio-preto-turismo",
  "casa-bauducco-riopreto-shopping-reabertura-ambiente-renovado",
  "socorro-sp-cachaca",
  "itamar-vieira-junior-participa-de-bate-papo-no-sesc-rio-preto"
]);
function decodeHtml(v=""){return v.replace(/&amp;/g,"&").replace(/&#038;/g,"&").replace(/&quot;/g,'"').replace(/&#039;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");}
function meta(html,key){const p1=new RegExp('<meta[^>]+(?:property|name)=["\\\']'+key+'["\\\'][^>]+content=["\\\']([^"\\\']+)["\\\']','i');const p2=new RegExp('<meta[^>]+content=["\\\']([^"\\\']+)["\\\'][^>]+(?:property|name)=["\\\']'+key+'["\\\']','i');return decodeHtml((html.match(p1)||html.match(p2)||[])[1]||"");}
function logo(html){const a=html.match(/<img[^>]+class=["'][^"']*custom-logo[^"']*["'][^>]+src=["']([^"']+)["']/i);const b=html.match(/<img[^>]+src=["']([^"']+)["'][^>]+class=["'][^"']*custom-logo[^"']*["']/i);return decodeHtml((a||b||[])[1]||"");}
module.exports=async function handler(req,res){
  const slug=String(req.query.slug||"");
  if(!ALLOWED.has(slug))return res.status(400).json({error:"slug_not_allowed"});
  const url=slug==="home"?"https://hi-mundim.com.br/":"https://hi-mundim.com.br/"+slug+"/";
  try{
    const upstream=await fetch(url,{headers:{"user-agent":"Mozilla/5.0 Hi-Mundim-Radio-Demo/1.0","accept":"text/html"}});
    if(!upstream.ok)return res.status(502).json({error:"source_unavailable",status:upstream.status});
    const html=await upstream.text();
    res.setHeader("Cache-Control","s-maxage=21600, stale-while-revalidate=86400");
    return res.status(200).json({title:meta(html,"og:title"),image:meta(html,"og:image"),description:meta(html,"og:description"),logo:slug==="home"?logo(html):""});
  }catch(e){return res.status(502).json({error:"source_fetch_failed"});}
};