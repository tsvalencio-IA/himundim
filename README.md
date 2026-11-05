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

## Configurar e operar

1. Em **Configuração**, informe o nome, a mensagem e, se necessário, uma fonte contínua de áudio por HTTPS.
2. Em **Transmissão**, teste um link antes de colocá-lo no ar. Publicar uma URL não cria um servidor de transmissão nem captura um microfone.
3. Cadastre programas com áudio direto. É possível editar, publicar, ocultar e ouvir um teste privado. Um programa vinculado à agenda precisa ter seus horários removidos antes da exclusão.
4. Agende programas publicados com início e fim. O fuso é sempre `America/Sao_Paulo`; conflitos são rejeitados em uma transação no banco. Horários antigos sem fim precisam ser editados para liberar novas entradas que se sobreponham.

Prioridade da rádio: fonte imediata → programa no horário → fonte contínua habilitada → fora do ar. O ouvinte pode selecionar um programa do acervo e usar **Voltar à rádio** para retornar à transmissão.

O site oferece busca por programa, filtro de categoria, mini-player, volume, controles de mídia quando suportados pelo navegador e tema claro/escuro. A reprodução começa por ação do ouvinte. A continuidade em segundo plano depende do navegador e do sistema.

Todos os registros administrativos novos incluem autor e data de atualização. Nenhum dado de demonstração é gravado no Firebase pela publicação do site.

## Verificação

```sh
node --test tests/*.test.js
```

Os testes verificam prioridade de fontes, links de áudio, rascunhos, limites de horários, conflitos e conversão do fuso de Brasília. O login e as gravações reais dependem das credenciais e regras existentes no Firebase.
