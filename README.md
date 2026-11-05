# Hi-Mundim | Rádio online

Projeto independente da rádio online do Hi-Mundim.

- Site editorial: https://hi-mundim.com.br/
- Firebase: mesmo projeto já utilizado pela Bíblia Rádio
- Namespace exclusivo no Realtime Database: `radio/himundim/`
- A aplicação não escreve nos nós operacionais da Bíblia Rádio.

## Rotas

- `/` — rádio pública
- `/admin/` — painel administrativo

## Estrutura de dados

```
radio/
  himundim/
    config/
    live/
    programs/
    schedule/
    library/
    liveMedia/
    webrtc/
```

## Eixos editoriais

- Caminhos — turismo e mobilidade
- Sabores — gastronomia
- Balaio — cultura, lazer e tempo livre

## Publicação

Projeto estático compatível com Vercel.

## Acesso administrativo

Abra https://himundim-radio.vercel.app/admin e use a conta do Firebase já associada ao UID `C19UZ7R1OSRaAGZ3XSXfBFaUzMD2`.
O código não contém o e-mail nem a senha dessa conta. Não existe senha padrão ou cadastro público de administrador.

Se o e-mail for desconhecido, abra o projeto **biblia-radio → Authentication → Users** no console do Firebase e localize o UID acima. A própria tela de acesso contém essa orientação.
Com o e-mail identificado, use **Esqueci minha senha**. O link de redefinição é enviado pelo Firebase; uma redefinição altera a senha da mesma conta compartilhada por aplicações que usam esse projeto.

O controle visual por UID não substitui as regras do Realtime Database. As regras existentes devem autorizar gravações somente para a conta administradora no caminho `radio/himundim`. Esta atualização não altera usuários, senhas nem regras do Firebase.

## Fluxo da rádio

O ouvinte abre a própria página Hi-Mundim e toca em **Ouvir agora**. Não existe cadastro de link público nem outra página obrigatória para ouvir.

No administrativo, **Ativar microfone → Entrar ao vivo** transmite o áudio do aparelho. A mesa mistura voz, música e vinhetas. Arquivos locais podem ser carregados na mesa; a biblioteca permite enviar e reutilizar músicas e vinhetas. Programas gravados também recebem upload direto, sem exigir uma URL.

A transmissão e a mesa reutilizam a lógica do aplicativo Bíblia Rádio, com transporte WebRTC e sinalização pelo Firebase. Referência de origem: `biblia-app-ruby.vercel.app/web/admin.js` e `/web/radio.js`, implantação do commit `de2938ee8d9329247910b21732099bbc5e8f5e91`. A aplicação e os dados da Bíblia Rádio não são alterados. Todo o estado desta implementação usa `radio/himundim/`. Os uploads usam o mesmo serviço de arquivos já usado pelo aplicativo, em pasta própria `himundim`.

1. Abra `/admin`, ative o microfone e entre ao vivo. Mantenha o estúdio aberto durante a transmissão.
2. O público abre `/` e toca em **Ouvir agora**. A conexão anônima ocorre nos bastidores, sem formulário de login para o ouvinte.
3. Use os controles de volume da mesa para microfone, música, vinhetas e saída. O microfone não retorna para o alto-falante do estúdio.
4. Em **Músicas e vinhetas**, envie arquivos para reutilizar. Em **Programas gravados e agenda**, envie um programa e defina seus horários.
5. Em **Configurações da rádio** ficam o nome, a mensagem e as fontes externas anteriores, preservadas como opções avançadas.

Prioridade: seleção explícita do acervo → estúdio ao vivo ou fonte imediata → programa no horário → fonte contínua habilitada → fora do ar. A pausa do ouvinte fecha a conexão ao estúdio; retomar cria uma conexão nova. Encerrar a transmissão desliga o microfone e fecha os pares. Se o estúdio perder a conexão, a presença da sessão é desativada pelo Firebase e a página volta para a programação disponível.

## Permissões do ao vivo

O estúdio verifica a permissão de uma conexão anônima temporária dentro da sessão real antes de anunciar **NO AR**. Essa verificação usa uma instância Firebase separada, persistência em memória e exclui a conta e o registro temporários ao terminar. Não altera a conta administradora.

A autenticação anônima está habilitada no Firebase. Uma sondagem sem sessão ativa foi recusada pelo banco e seu usuário temporário foi excluído; isso **não confirma** se a regra permite conexões dentro de uma sessão ativa. A regra atual completa não foi obtida. Não houve alteração das regras.

Se a verificação do estúdio apontar bloqueio, o arquivo `docs/firebase-himundim-webrtc.rules.json` contém somente o bloco candidato para o caminho **rules.radio.himundim.webrtc**. Ele precisa ser combinado com as regras atuais nesse ponto exato; não deve substituir o arquivo inteiro de regras. O bloco dá escrita administrativa na sessão e permite ao ouvinte escrever somente no próprio UID durante uma sessão ativa, além de remover seus registros. As regras e os dados de `radio/live`, `radio/programs` e `radio/webrtc` da Bíblia permanecem fora desse bloco.

O transporte preserva os servidores STUN da implementação original. Redes que exigem relay TURN podem impedir a conexão direta. Não foi configurado um serviço TURN sem credenciais do usuário. Navegadores e sistemas podem interromper o estúdio quando ele fica em segundo plano; o bloqueio de tela é solicitado quando suportado.

## Verificação

```sh
node --test tests/*.test.js
```

Os 19 testes cobrem seleção de fontes, URLs de áudio, agenda, fuso de Brasília, sinalização host/ouvinte, candidatos ICE, cancelamento durante autenticação e limpeza de conexões, todos sem dados de produção.

A interface foi verificada em larguras de 320, 390, 768 e 1280 pixels, sem rolagem lateral. O ambiente isolado confirmou a passagem de título e estado do estúdio para a página clonada. O navegador de teste não produziu candidatos de rede WebRTC e não transportou pacotes de áudio; por isso o teste não comprova recepção sonora entre aparelhos reais. O player só indica reprodução do ao vivo depois de a conexão WebRTC ser estabelecida. A transmissão real e os uploads dependem das permissões e dos serviços existentes.
