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