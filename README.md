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

## YouTube

O painel abre o YouTube em **Pesquisa e pré-escuta**: digitar o nome, escolher um resultado, pré-ouvir somente neste aparelho, enviar aos ouvintes ou salvar na biblioteca. A pesquisa fica visível; o campo de link é uma alternativa recolhida. A pré-escuta é interrompida ao enviar o vídeo para a rádio. O ouvinte continua na página Hi-Mundim; o player incorporado aparece junto aos controles da rádio.

O estado é sincronizado exclusivamente em `radio/himundim/liveMedia/youtube` e fica vinculado à sessão de estúdio. Quem chega depois acompanha a posição atual do programa; pausar localmente é respeitado, inclusive durante atualizações de volume. Encerrar o estúdio retira o YouTube da transmissão. A voz continua em WebRTC e o vídeo usa o player oficial incorporado, como no fluxo da Bíblia; não há extração de áudio do YouTube.

Colar um vídeo e reproduzir não exige chave de pesquisa. Para pesquisar dentro do painel, a configuração opcional usa YouTube Data API, como o aplicativo original. A chave fica somente no armazenamento local deste aparelho. Sem chave, o painel permanece no estúdio e pede a configuração da pesquisa. A chave salva no endereço da Bíblia não é transferida pelo Firebase para o endereço Hi-Mundim, pois o aplicativo original a armazena somente no navegador e na origem da página. Vídeos podem impedir incorporação e o navegador pode exigir um toque adicional; o player exibe essas situações.

## Permissões do ao vivo

As regras completas fornecidas pelo usuário comprovam a diferença: as conexões da Bíblia são autorizadas em `radio/webrtc`, usando o estado de `radio/live`; o namespace novo `radio/himundim/webrtc` não tinha a regra de escrita do ouvinte. Compartilhar o projeto Firebase não replica uma regra para outro caminho.

`docs/firebase-database.rules.json` preserva integralmente o objeto de regras fornecido e acrescenta somente `rules.radio.himundim`. A conta administradora mantém o acesso que já possuía. O ouvinte pode escrever somente em seu UID, dentro da sessão Hi-Mundim publicada como ativa, e remover sua própria conexão. O arquivo de regras precisa ser publicado no Realtime Database; publicar este repositório na Vercel não aplica regras do Firebase.

A verificação artificial que criava outra conta anônima antes de publicar `live` foi removida: a regra de ouvintes depende exatamente de `live` já estar ativo. A ordem agora é preparar o estúdio → publicar a sessão ao vivo → conectar o ouvinte pelo fluxo real. Não são criadas contas de verificação no administrativo.

O transporte preserva os servidores STUN da implementação original. Redes que exigem relay TURN podem impedir a conexão direta. Não foi configurado um serviço TURN sem credenciais do usuário. Navegadores e sistemas podem interromper o estúdio quando ele fica em segundo plano; o bloqueio de tela é solicitado quando suportado.

## Verificação

```sh
node --test tests/*.test.js
```

Os testes cobrem seleção de fontes, agenda, fuso de Brasília, sinalização host/ouvinte, candidatos ICE, cancelamento, limpeza de conexões, interpretação dos comandos do YouTube, pausa local, entrada tardia e preservação das regras originais. Os testes de regras executam as expressões preparadas e não substituem a publicação e a validação no Firebase real.

A interface é verificada em larguras de 320, 390, 768 e 1280 pixels, sem rolagem lateral. No ambiente isolado, foi confirmada a publicação do estúdio, a abertura da pré-escuta oficial do YouTube, o envio do vídeo ao player da página clonada, a pausa e o salvamento da referência na biblioteca. O navegador de teste não transporta pacotes de áudio WebRTC; a recepção sonora entre aparelhos reais precisa ser validada após a publicação das regras.
