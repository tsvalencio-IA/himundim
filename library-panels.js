(() => {
  'use strict';
  let maximized=null,previousFocus=null;
  function restore(){if(!maximized)return;maximized.classList.remove('panel-maximized');maximized.removeAttribute('aria-modal');if(maximized.dataset.previousRole)maximized.setAttribute('role',maximized.dataset.previousRole);else maximized.removeAttribute('role');maximized.querySelector('[data-maximize-panel]').textContent='Maximizar';document.body.classList.remove('has-maximized-panel');maximized=null;previousFocus?.focus({preventScroll:true});}
  document.querySelectorAll('[data-library-panel]').forEach(panel=>{
    const toolbar=document.createElement('div');toolbar.className='library-panel-tools';
    const maximize=document.createElement('button');maximize.type='button';maximize.textContent='Maximizar';maximize.className='panel-tool';maximize.dataset.maximizePanel='';
    const minimize=document.createElement('button');minimize.type='button';minimize.textContent='Minimizar';minimize.className='panel-tool';minimize.setAttribute('aria-expanded','true');
    let body;
    if(panel.tagName==='DETAILS'){
      panel.querySelector('summary').after(toolbar);
      body=panel.querySelector('.tools-body')||panel.querySelector('[data-panel-content]');
      if(!body){body=document.createElement('div');[...panel.children].filter(el=>el.tagName!=='SUMMARY'&&el!==toolbar).forEach(el=>body.append(el));panel.append(body);}
    }else{
      body=document.createElement('div');body.className='library-panel-content';[...panel.children].forEach(el=>body.append(el));panel.append(toolbar,body);
    }
    toolbar.append(maximize,minimize);
    maximize.onclick=()=>{
      if(maximized===panel){restore();return;}
      restore();previousFocus=maximize;maximized=panel;if(panel.tagName==='DETAILS')panel.open=true;body.hidden=false;minimize.textContent='Minimizar';minimize.setAttribute('aria-expanded','true');
      panel.dataset.previousRole=panel.getAttribute('role')||'';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.classList.add('panel-maximized');document.body.classList.add('has-maximized-panel');maximize.textContent='Restaurar tamanho';
      (body.querySelector('input[type="search"]')||maximize).focus({preventScroll:true});
    };
    minimize.onclick=()=>{
      if(maximized===panel)restore();
      if(panel.tagName==='DETAILS'){panel.open=false;panel.querySelector('summary').focus();return;}
      body.hidden=!body.hidden;minimize.textContent=body.hidden?'Abrir biblioteca':'Minimizar';minimize.setAttribute('aria-expanded',String(!body.hidden));
    };
  });
  document.addEventListener('toggle',event=>{if(maximized&&event.target.tagName==='DETAILS'&&!event.target.open&&event.target.contains(maximized))restore();},true);
  document.addEventListener('keydown',event=>{
    if(!maximized)return;
    if(event.key==='Escape'){event.preventDefault();restore();}
    if(event.key==='Tab'){
      const focusable=[...maximized.querySelectorAll('a[href],button,input,select,textarea,summary,audio[controls]')].filter(el=>!el.disabled&&!el.hidden&&el.getClientRects().length);
      const first=focusable[0],last=focusable.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  });
})();
