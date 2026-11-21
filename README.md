# Maré Alta — protótipo

Jogo 3D de sobrevivência, exploração e construção em alto-mar, no navegador.
Three.js e Cannon-es no frontend, Node.js + WebSocket no backend.

## Rodar localmente

```bash
# 1) servidor multiplayer (opcional — o modo solo funciona sem ele)
cd server && npm install && npm start        # ws://localhost:3001

# 2) frontend
cd client && npm install && npm run dev       # http://localhost:8080
```

Abrir `index.html` direto do disco (file://) não funciona: módulos ES precisam de um servidor HTTP.

## Deploy

**Deploy completo no Render:** New > Blueprint > aponte para o repositório e use o `render.yaml`
da raiz. Ele cria o servidor WebSocket e o site estático; o cliente já recebe a URL do servidor
pela variável `VITE_SERVER_URL`. O servidor precisa acessar também `client/src/systems/loot.js`,
por isso o serviço backend usa a raiz do repositório como contexto de deploy.

O plano grátis do backend "dorme": a primeira conexão pode levar até ~1 minuto.

**Frontend na Vercel (alternativa):** New Project > mesmo repositório e mantenha Root Directory
na raiz (`.`). O `vercel.json` configura a instalação e publicação de `client/dist`. Se usar um
servidor Render com outro endereço, configure `VITE_SERVER_URL` como `wss://SUA-URL.onrender.com`.

## Controles

No celular/tablet os controles de toque aparecem sozinhos (`client/src/ui/touch.js`): joystick à
esquerda (empurre até o fim para correr), arraste a metade direita para girar a câmera, botões de
atacar/pegar, pular, interagir (E), mirar e recarregar, e no topo trocar arma, curar, câmera e tela cheia.
Durante a construção aparecem Soltar/Soldar/Mover/Cancelar e, no mastro, ◀ Vela ▶.

| Tecla | Ação |
|---|---|
| W A S D / Shift | andar / correr |
| Espaço | pular, subir em bordas, sair da água |
| Mouse ou setas | câmera |
| E | abrir caixa / instalar vela; controlar vela depois da partida |
| Z / C | soldar durante o build / girar vela perto do mastro |
| Botão esquerdo | pegar a peça contornada de verde |
| Q | soltar a peça carregada |
| Mouse + WASD | virar câmera, arrastar a peça e andar |
| V | teletransportar a peça para o ponto indicado pela mira |
| R | liberar o cursor e abrir o gizmo de rotação |
| Shift durante o arraste | encaixar a rotação em incrementos |
| Botão direito no gizmo | mover a câmera sem sair da rotação |
| Botão direito fora do gizmo / Esc | cancelar e restaurar a peça |
| X | dessoldar peça fixada próxima |
| Clique / botão direito | atacar ou atirar / mirar fora do build mode |
| 1 2 3 / roda do mouse | trocar entre armas do hotbar / inventário |
| 4 / 5 | usar bandagem / kit médico |
| F | alternar 1ª / 3ª pessoa (1ª é o padrão) |
| H | ajuda |

O contorno verde indica a peça visada que está ao alcance de coleta. Clique nela com o botão esquerdo
para pegar; pressione [Q] para soltar a peça no mundo.

Ao carregar, a peça real permanece visível e dinâmica: segue o raycast da mira por um controle de
mola, mantendo colisões com o cenário e com o personagem, gravidade e empuxo. Andar e girar a câmera
continuam disponíveis fora do modo de rotação. [R] libera o cursor e mostra o gizmo; arraste um anel
para girar a peça. Segure o botão direito para mover a câmera sem sair do modo de rotação e pressione
[R] novamente para voltar à mira. [Z] solda a peça somente quando ela estiver fisicamente encostada
na jangada, inclusive pela lateral; a posição do cursor não define o ponto de solda. Se a peça ficar presa,
pressione [V] para reposicioná-la no ponto indicado pela mira.

Todos os jogadores começam em terra firme, com uma arma improvisada sorteada; ninguém nasce com
pistola. A jangada inicial tem uma plataforma central indestrutível e um encaixe para uma única
plataforma de madeira; ambas medem 6×6 m. Pegue a plataforma de madeira e fixe-a à jangada com `[Z]`; depois,
instale a vela no mastro com `[E]`.
Antes de iniciar, escolha o personagem no menu, com prévia 3D (arraste para girar):
- **Náufrago**: óculos e barba.
- **Pílula** (`client/src/player/pill.js`, modelo procedural): cor da cápsula, da base e das luvas,
  7 rostos, 5 calçados (tênis, botas, galochas, nadadeiras, chinelo) com cor, e 8 chapéus (pirata,
  palha, boné, cartola, capitão, coroa, gorro) com cor; botão "Aleatório". Tem animações próprias
  (andar gingado, soco, mira, pulo, nado).

A escolha fica salva no navegador e, no multiplayer, os outros jogadores veem a sua pílula
(código curto `ap` no estado do jogador).
O personagem (`client/assets/castaway-survivor.glb`) usa a malha e a textura de um modelo Tripo, com o
esqueleto Mixamo e os pesos transferidos do modelo Meshy (`tools/texture-bake/`), e animações de caminhada,
corrida e ataque.
Natação e parkour usam o rig procedural para evitar deformações causadas por clipes incompatíveis com o esqueleto.
O espaço de construção ao redor da jangada e da peça inicial fica livre; árvores, caixas e ruínas
ficam mais afastadas, na borda da ilha.

Após instalar a vela, há um breve período de calmaria, seguido por uma tempestade gradual e pela
subida global da água. As faixas mais baixas das ilhas são inundadas primeiro. Quando a terra
inicial estiver submersa, todos devem embarcar; a jangada então parte automaticamente para o oceano.
As ilhas exploráveis ficam acima da maré máxima e abrigam fortes improvisados ou cabanas com
guarnições de inimigos. Depois da partida, grupos de piratas podem alcançar a jangada em pequenas
balsas, lançar ganchos, voar até o convés e atacar quem estiver a bordo.

### Eventos do mar e balanceamento

Depois da partida o céu abre aos poucos e, de tempos em tempos (~2–3 min), o host sorteia um evento
(`client/src/systems/events.js`, constantes em `EVENT_BALANCE`):

- **Onda gigante**: uma frente de água de ~4,5 m atravessa o mar (entra em `waveHeight` e no shader,
  então barco, detritos e nadadores sentem a onda). Baixe a vela e fique perto do mastro; com a vela
  cheia a jangada é arremessada e quem está a bordo leva dano. Quem está longe do mastro é jogado
  pelo convés.
- **Furacão**: um funil com nuvem em espiral, spray e destroços passa ao lado da rota e puxa a jangada
  para o olho (o mar afunda e gira em espiral ali). Levante a vela e gire-a para o lado oposto ao olho;
  se a jangada chegar ao olho, ela é sugada, gira e é cuspida com dano.

- **Oceano que seca** (`client/src/systems/tide.js`, constantes em `TIDE`): só dois estados — **mar cheio**
  e **mar seco** — num ciclo de 6 min (seco ≈ 2 min 24 s), com uma transição rápida (16 s) entre eles,
  calculado do relógio comum. Seco, a água desce abaixo do **fundo do mar** (`client/src/world/seabed.js`)
  e dá para andar livremente por ele. A jangada encalha até a água voltar. **Itens pesados afundam**
  (placa metálica, calha, sucata e pedaço de casa, `sinks: true` em `DEBRIS`): ficam no fundo e só são
  alcançáveis com o mar seco. **Naufrágios** (30% dos chunks sem ilha) têm 1–2 baús e destroços em volta.

Eventos são anunciados pela rede (`t: 'event'`) e derivados do relógio comum, então todos os
jogadores veem o mesmo. Piratas ficaram raros (`PIRATE_BALANCE` em `systems/enemies.js`): primeira
invasão após 2,5–3,5 min, depois a cada 3,5–5,5 min, com 1–3 balsas, nunca durante um evento.
As ilhas aparecem em 7% dos chunks (`islandChance` em `systems/loot.js`).

A ilha inicial é garantida e tem três caixas, incluindo um cache com pistola e bandagens
dimensionadas pela quantidade de jogadores. As caixas abrem com animação, mantêm o estoque e
permitem retirar cada item individualmente. No multiplayer, o servidor gera e controla o estoque
compartilhado; no modo solo, a geração usa a seed do mundo.

Armas usam raridade de 1 a 5 estrelas, atributos próprios de dano, alcance, cadência, precisão,
capacidade de carregador e durabilidade. Armas e raridades superiores dependem da exploração.
O loot é configurado em `client/src/systems/loot.js` por região, tipo de caixa, raridade,
quantidade e quantidade de jogadores para o cache inicial.

As ilhas aparecem com baixa frequência (7% dos chunks) para deixar mais espaço aberto no oceano;
a ilha inicial é a exceção garantida. Esta versão não possui crafting nem sede.

Detritos e peças colocadas são corpos rígidos com colisão; objetos flutuantes recebem empuxo
aproximado amostrado nas extremidades. Peças fixadas à jangada usam juntas rígidas ligadas ao corpo
cinemático da jangada. A água não é simulada como fluido.

## Gráficos

Água em shader (ondas direcionais, Fresnel, reflexo do céu, espuma, água rasa perto das ilhas), céu em
gradiente que reage à tempestade, sombras do sol, IBL e tone mapping, palmeiras/rochas/grama procedurais e
textura de tábuas nas peças. Detalhes e convenções em `PROJECT_MAP.md` (seção 6b).

## Primeira pessoa

Em 1ª pessoa o jogador vê braços, mãos e arma (`player/viewmodel.js`, `viewmodel-parts.js`), desenhados
numa cena/câmera própria por cima do mundo. Nada disso é enviado pela rede: os outros jogadores só veem o
modelo de 3ª pessoa. As animações são procedurais (molas + keyframes): sacar, andar/correr, mira, recuo,
recarga por tipo de arma, golpes corpo a corpo, nado, escalada, carregar peça e usar bandagem/kit.
Para depurar poses no console: `G.viewmodel.debug = { reloadP: 0.4 }` (também `ads`, `sprint`, `swingP` +
`swingStyle`, `swim`, `carry`, `mantleU`).

## Estrutura

```
client/
  index.html, style.css
  vendor/            three.js (cópia local)
  package.json       Vite, Cannon-es e scripts de desenvolvimento/build
  src/
    main.js          cena, loop, menu e início da partida
    config.js        constantes e URL do servidor
    core/            input, utilidades, RNG com seed
    world/           oceano, Cannon-es, colisão, mundo procedural (chunks, detritos, ilhas)
    boat/            barco, flutuação, vela, catálogo de peças
    player/          personagem, parkour, câmera, modelo placeholder
    build/           construção modular
    systems/         início/inundação, vida/inventário, combate, inimigos, interação
    net/             cliente WebSocket
    ui/              HUD
server/
  server.js          salas, host, snapshots de barco/jogadores/física e estados das peças
```

Veja `PROJECT_MAP.md` (mapa rápido do código, ganchos e convenções) e `PROJECT_STATE.md` (estado atual e próximos passos).
