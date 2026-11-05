(() => {
  'use strict';
  const buttons=[...document.querySelectorAll('[data-install-radio]')];
  let promptEvent=null,installed=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const dialog=document.createElement('dialog');dialog.className='install-dialog';dialog.setAttribute('aria-labelledby','installTitle');
  dialog.innerHTML='<button class="install-close" type="button" aria-label="Fechar instalação">×</button><img src="/icons/radio-192.png" width="80" height="80" alt="Ícone da Rádio Hi-Mundim"><h2 id="installTitle">Rádio Hi-Mundim no celular</h2><p id="installInstructions"></p><p id="installResult" role="status" aria-live="polite"></p><button class="install-done" type="button">Entendi</button>';
  document.body.append(dialog);
  const close=()=>{if(dialog.close)dialog.close();else dialog.removeAttribute('open');};
  dialog.querySelectorAll('button').forEach(button=>button.onclick=close);
  const refresh=()=>buttons.forEach(button=>{button.hidden=installed;button.disabled=false;});
  function instructions(){
    const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    document.getElementById('installInstructions').textContent=ios?'No Safari, toque em Compartilhar → Adicionar à Tela de Início. Mantenha “Abrir como App” ativado, se aparecer, e toque em Adicionar. O nome será Rádio Hi-Mundim.':'No Chrome do celular, toque no menu ⋮ → Adicionar à tela inicial → Instalar. Se o site estiver aberto dentro de outro aplicativo, escolha Abrir no Chrome primeiro. No computador, use o botão de instalação na barra de endereço.';
    document.getElementById('installResult').textContent='O aplicativo abre direto na rádio. É preciso conexão para ouvir e participar.';
    if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');
  }
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptEvent=event;refresh();});
  window.addEventListener('appinstalled',()=>{installed=true;promptEvent=null;refresh();close();});
  buttons.forEach(button=>button.onclick=async()=>{
    if(installed)return;
    if(!promptEvent){instructions();return;}
    const event=promptEvent;promptEvent=null;button.disabled=true;
    try{await event.prompt();const choice=await event.userChoice;if(choice.outcome!=='accepted')instructions();}
    catch(_){instructions();}
    finally{refresh();}
  });
  if('serviceWorker'in navigator&&window.isSecureContext){
    navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).then(()=>{document.documentElement.dataset.radioInstall='ready';}).catch(()=>{document.documentElement.dataset.radioInstall='manual';});
  }
  refresh();
})();
