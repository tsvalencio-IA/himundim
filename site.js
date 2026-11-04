(()=>{"use strict";
const cards=[...document.querySelectorAll("[data-slug]")];
const unique=[...new Set(cards.map(el=>el.dataset.slug))];
async function getMeta(slug){
  try{
    const r=await fetch("/api/himundim-meta?slug="+encodeURIComponent(slug),{cache:"force-cache"});
    if(!r.ok)return null;
    return await r.json();
  }catch(_){return null;}
}
async function hydrate(){
  const brand=await getMeta("home");
  const logo=document.getElementById("sourceLogo"),fallback=document.getElementById("brandFallback");
  if(brand&&brand.logo&&logo){
    logo.src=brand.logo;
    logo.onload=()=>{logo.hidden=false;if(fallback)fallback.hidden=true;};
  }
  await Promise.all(unique.map(async slug=>{
    const meta=await getMeta(slug);
    if(!meta||!meta.image)return;
    document.querySelectorAll('[data-slug="'+CSS.escape(slug)+'"]').forEach(card=>{
      const img=card.querySelector("img");
      if(!img)return;
      img.src=meta.image;
      img.alt=meta.title||"";
      img.addEventListener("load",()=>card.classList.add("image-ready"),{once:true});
    });
  }));
}
hydrate();
})();