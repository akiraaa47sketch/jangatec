# PROJECT STATE — Jangatec (protótipo v0.1)

Cole este bloco no início de uma nova conversa para continuar o projeto.

## Arquitetura atual
- Frontend em `client/` (Vite, ES modules, Three.js local e Cannon-es) -> build estático para Vercel.
- Backend em `server/` (Node + `ws`) -> Render. Salas de até 4 jogadores.
- Contexto global `G` (criado em `main.js`) liga os sistemas: `G.input, colliders, world, boat,
  player, build, survival, combat, enemies, interact, net, hud, solids`.
- Personagem e colisão de gameplay continuam cinemáticos; detritos e peças usam Cannon-es. Corpos
  flutuantes recebem empuxo aproximado e peças fixadas usam juntas rígidas no corpo da jangada.
- Quem está a bordo é carregado pelo deslocamento do barco a cada frame (`boat.carry`), inclusive
  no ar; o modelo vira filho do grupo do barco para acompanhar balanço/inclinação.

## Sistemas implementados (prompts 0–9 + base do 18)
- Fundação: cena, loop com delta time, input (pointer lock + fallback), HUD, menu.
- Personagem 3ª pessoa: andar, correr, pular, nado, câmera com colisão, mira por cima do ombro.
- Parkour: `tryMantle` cobre vault, agarrar/subir bordas e sair da água.
- Barco: flutuação por 4 amostras de onda, inclinação limitada (nunca vira), encalha em ilhas.
- Vela: levantar/baixar no mastro, ângulo da vela define a curva; baixada = barco para aos poucos.
- Construção física: selecionar detritos com contorno verde e pegar com clique esquerdo; carregar
  o objeto real com força-mola via raycast,
  mantendo gravidade e colisões com cenário/personagem; movimento/câmera continuam ativos, R libera
  o cursor para arrastar os anéis do gizmo com a câmera travada, V reposiciona a peça na mira,
  Q solta, Z solda durante o build e X dessolda peças próximas.
- Detritos: 15 tipos irregulares, colocáveis e movíveis, com estado sincronizado no multiplayer.
- Sobrevivência: vida e sede (lenta), consumíveis, dano de queda, queda/respawn no barco; sem fome.
- Combate: facão, pistola, escopeta (achada em caixotes); hitscan, dispersão, recuo, recarga.
- Inimigos: FSM idle/patrulha/perseguição/ataque/recuo/procura/morte; 4 tipos; ativação por
  distância; pensam a 5 Hz. Vivem nas ilhas.
- Mundo procedural por seed em chunks de 90 m; ilhas em 7% dos chunks, dificuldade 1–5 pela distância da origem.
- Eventos do mar (`systems/events.js`): onda gigante e furacão sorteados pelo host após a partida,
  sincronizados por `t: 'event'`; `sea.surge` / `sea.vortex` entram em `waveHeight` e no shader.
  Barco ganhou `fling`/`spin` (arremesso/giro) e inclinação maior durante eventos.
- Piratas raros (`PIRATE_BALANCE`): balsas remando nas ondas, bandeira, salto no gancho; inimigos com
  reação a dano, morte animada (tomba, afunda, some) e respiração parada.
- Texturas procedurais em `world/textures.js`: madeira com relevo (bumpMap), areia, grama, lona da
  vela, palha, paliçada e metal; jangada com barris, cordame e bandeira; fogueiras animadas.
- Multiplayer base: seed, posições, barco (host simula), vela, peças, estados e snapshots de corpos físicos;
  entrada tardia e migração de host.

## Sistemas pendentes
- Prompt 10 piratas/invasões (regra: vela baixada UMA vez por invasão), 11 canhões/naval,
  13 maré e tempestades (`sea.level` e `sea.amp` já existem em `world/ocean.js`),
  14 mais estruturas (vilas, faróis, fortalezas), 15 progressão em fases, 16 chefes, 17 Kraken.
- Multiplayer: inimigos, dano e inventário ainda são locais de cada cliente; sem revive de aliados.
- Sem salvamento de partida. Sem som. Modelos ainda procedurais (sem arquivos de arte).

## Arquivos importantes
`client/src/main.js`, `world/colliders.js`, `boat/boat.js`, `boat/pieces.js`, `player/player.js`,
`build/build.js`, `world/world.js`, `systems/*.js`, `net/net.js`, `server/server.js`.

## Decisões técnicas importantes
- A navegação do barco continua controlada pelo jogo; o motor de corpos rígidos simula colisões,
  empuxo de detritos/peças soltas e juntas das peças fixadas.
- Frente do barco = +Z local. `rot()` em `core/util.js` é a única convenção de rotação.
- Posições a bordo trafegam na rede em coordenadas locais do barco.
- Jangada inicial tem ids fixos (`base-1-1`…, `mastro`); o servidor guarda só as diferenças.
- Geração por chunk consome o RNG sempre na mesma ordem (determinismo por seed).

## Bugs e limites conhecidos
- Inimigos não têm pathfinding: contornam paredes só com um desvio lateral simples.
- Peças grandes como portas e telhados são coletadas direto (ainda não se carrega/arrasta).
- Inimigos não sobem no barco (chega com os piratas).
- Barco muito largo pode encalhar um pouco longe da praia.

## Próximos passos recomendados
1. Salvamento local + inimigos autoritativos no servidor.
2. Prompt 13 (maré/tempestade) — pequeno, o mar já tem os parâmetros.
3. Prompt 10 (piratas), depois 11 (canhões).
