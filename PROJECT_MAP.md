# PROJECT_MAP — Jangatec (guia rápido para analisar o código sem ler tudo)

> **Como usar (humano ou IA):** leia ESTE arquivo primeiro; abra só o módulo da tabela "Onde mexer".
> Para atualizar o índice (seção 10): `python3 tools/map-index.py` e cole o resultado na seção 10.
> Estado de features/pendências: `PROJECT_STATE.md`. Controles e deploy: `README.md`.

## 1. Em 5 linhas
Jogo 3D de sobrevivência no navegador: **Three.js + Cannon-es** (cliente, Vite, ES modules) e **Node + ws** (servidor, salas de até 4).
Tudo se liga pelo objeto global **`G`** criado em `client/src/main.js` (também em `window.G` para debug).
Não há framework: cada sistema é uma classe com `update(dt)`. Sem servidor o jogo roda em modo solo.
Câmera padrão em **1ª pessoa** (`F` alterna 3ª). Braços/arma 1ª pessoa = **viewmodel**, só local (não vai à rede).
Linguagem do código/UI: português.

## 2. Contexto `G` (main.js)
`scene camera renderer solids[] started input colliders hud net survival combat enemies physics world boat player viewmodel startup build interact ocean sunVisual`

## 3. Ordem do loop (`frame()` em main.js)
`startup.update → boat.update → (carrega quem está a bordo) → hotkeys → player.update → viewmodel.update → player.updateCamera → build.update → world.update/updateFloodLevel → physics.update → enemies.update → interact.update → combat.update → survival.update → net.update → ocean.update → hud.update → renderer.render(scene) → viewmodel.render (2º passe) → input.endFrame`
Regra: **leituras de input (`mouse.dx`, `hit()`) só valem até `endFrame`** — qualquer sistema que as use deve rodar antes dele.

## 4. Onde mexer (tarefa → arquivo)
| Quero… | Arquivo / ponto |
|---|---|
| Atributos/raridade/dano de arma | `systems/combat.js` → `WEAPONS` |
| Loot por região/caixa | `systems/loot.js` → `LOOT_CONFIG`, `WORLD_LOOT_PARAMS` |
| Modelo/pose de arma em 1ª pessoa | `player/viewmodel-parts.js` → `SPECS.<id>` (hold, gripR/gripL, ads, muzzle, parts) |
| Animação 1ª pessoa (recarga, golpe, bob, sprint, nado…) | `player/viewmodel.js` (`reloadPose/reloadHand`, `SWINGS`, `applyOverrides`) |
| Câmera 1ª/3ª pessoa, mira, FOV | `player/player.js` → `updateFirstPersonCamera` / `updateCamera` |
| Movimento, pulo, parkour (mantle) | `player/player.js` → `update`, `tryMantle` |
| Modelo 3ª pessoa / animações Mixamo | `player/castaway.js`, `player/model.js` (placeholder + remotos) |
| Construção física (pegar/girar/soldar) | `build/build.js` (+ `world/physics.js` p/ corpos e juntas) |
| Peças do barco | `boat/pieces.js` (catálogo) e `boat/boat.js` |
| Inimigos / piratas | `systems/enemies.js` → `ENEMY_TYPES`, FSM em `think`, piratas `updatePirate*` |
| Mundo procedural / ilhas / caixas | `world/world.js` (`makeChunk`, `makeIsland`) |
| Maré, tempestade, fases | `systems/startup.js`, `world/ocean.js` (`sea.level/amp`), `world/sun.js` |
| Ondas (altura/forma) | `world/ocean.js` → tabela `WAVES` (alimenta física **e** shader) |
| Cor/espuma/reflexo da água | `world/ocean.js` → `FRAG`; cores `DEEP`/`SHALLOW` |
| Céu, IBL, sombras, tone mapping | `world/atmosphere.js` (+ `renderer.toneMapping` em `main.js`) |
| Palmeiras, rochas, grama, arbustos | `world/models.js`; colocação em `world/world.js` → `makeIsland` |
| Textura de madeira das peças | `world/textures.js` (`woodTexture`, `scaleBoxUVs`) |
| HUD / menus | `ui/hud.js`, `client/index.html`, `client/style.css` |
| Rede (mensagens) | `net/net.js` (`handle`/`update`) e `server/server.js` |
| Constantes (gravidade, velocidades) | `config.js` → `CFG` |

## 5. Ganchos entre sistemas (viewmodel) — chamados com `G.viewmodel?.…`
`combat.fire` → `onSwing(w)` (melee; devolve duração) · `onFire(w)` · `onDry()` · `muzzleWorld(out)` (origem do rastro)
`combat.update` → `onMeleeHit()` (dano melee cai em `pendingStrike`, ~42% do golpe)
`survival.use` → `onUse(item)` · `survival.damage` → `onHurt(n)` · `interact` (tecla E) → `onInteract()`
Combat lê `viewmodel.lowerEquip` para não atirar com a arma ainda sendo sacada.
Debug: `G.viewmodel.debug = { reloadP, ads, sprint, swingP, swingStyle, swim, carry, mantleU }` congela poses.
Convenção das armas: origem na empunhadura, cano em **-Z**, +Y cima, +X direita. `grip.p` = ponto no **eixo do cabo**
(o punho é deslocado automaticamente em `gripHand`). Mão esquerda = mesma malha espelhada em X
(pose esquerda = `mirrorEuler` da direita).

## 6. Convenções que causam bugs se esquecidas
- Rotação Y: sempre `rot()` de `core/util.js`. Frente do barco = **+Z local**.
- `camPitch` positivo = olhar para BAIXO. Frente da câmera = `(-sin yaw, -sin pitch, -cos yaw)`.
- Quem está a bordo é filho de `boat.group`; posições a bordo trafegam na rede em coordenadas locais do barco.
- Geração por chunk consome o RNG sempre na mesma ordem (determinismo por seed).
- Arquivos com **CRLF**: `systems/combat.js`, `player/castaway.js`, `build/build.js`, `systems/loot.js` — ao editar por script, preserve.
- Abrir `index.html` por `file://` não funciona (ES modules): use o servidor do Vite.

## 6b. Gráficos (convenções)
- **`waveHeight(x,z,t)` é a única fonte da verdade**: a tabela `WAVES` gera o JS (barco, física, jogador, câmera) e o GLSL.
  Mudou onda → muda nos dois. O shader exagera a inclinação só no *sombreamento* (`vN.xz * 2.2`), sem afetar a física.
- A água é uma malha **polar** centrada na câmera (≈20 mil vértices, densa perto). Winding `(a,b,c)` = normal para CIMA;
  invertido, o culling descarta a água inteira e você só vê o domo do céu.
- Cor do horizonte = `scene.fog.color` (o clima já a atualiza). Céu e água usam o mesmo `SKY_GLSL`, então refletem o que se vê.
- Sombras: `Atmosphere.markShadows()` marca sozinho toda malha opaca a cada 0,25 s. Para excluir: `mesh.userData.noShadow = true`
  (transparentes, ShaderMaterial e MeshBasicMaterial já são ignorados).
- Sol: `main.js` define a direção (~27° de elevação); `Atmosphere` move a luz junto com a câmera a cada quadro.
- Tone mapping `NeutralToneMapping`, IBL `environmentIntensity 0.32`. Se algo ficar estourado, mexa nesses dois primeiro.
- Vegetação usa RNG **derivado** (não o `r` da ilha) para não alterar o layout do mundo.

## 7. Rede (resumo)
Cliente→servidor: `join`, `state` (posição/yaw/a bordo/nadando/vel/morto), `boat` (só host), `physics` (só host), `sail`, `sail-install`, `carry`, `place`, `weld`, `unweld`, `crate:open/take`, `add/remove/collect`.
Servidor→cliente: `welcome`, `full`, `snap` (jogadores+barco), e reenvios dos itens acima.
**Lobby:** sala criada pelo menu (`join` com `create`) nasce com `room.lobby = true`; `welcome.lobby` traz `{host, max, players:[{id,name,ap}]}` e o menu abre `#lobbyModal` em vez de iniciar. Atualizações chegam por `lobby`; o capitão manda `lobby:start` e o servidor responde a todos `lobby:go` com `at` (hora do servidor, +1,5 s). Cada cliente espera até `at` (`serverNow()` em `core/util.js`) e chama `start()` → cutscene começa junta, já com os passageiros do lobby (`G.net.lobbyPlayers`). Quem entra depois do início vai direto para a partida.
**Não sincronizado ainda:** inimigos, dano, inventário, arma equipada e ataques (cada cliente simula os seus).
Jogadores remotos usam `makeHumanoid` (sem arma). Para mostrar ataque/arma dos outros: enviar `weaponId` + evento de ataque em `net.update` e animar o remoto.

## 8. Testar sem GPU (como foi validado)
`npm i @sparticuz/chromium puppeteer-core` (Chromium com SwiftShader dentro do pacote npm) → WebGL funciona em sandbox.
- Subir `vite` e abrir `http://127.0.0.1:8080`; clicar `#btnSolo`; usar `window.G`.
- Render por software é lento (<1 FPS com mundo). "Modo estúdio": esconder filhos de `G.scene` e `G.ocean.mesh`, `hud` e olhar p/ cima (`camPitch=-1.1`) → só o viewmodel renderiza, rápido.
- Esperar `G.viewmodel.lowerEquip < 0.005` antes de capturar (animação de sacar é por quadro, `dt` ≤ 1/30).
- Cada chamada de ferramenta mata processos de fundo: suba o vite e rode o teste no MESMO comando.

## 9. Pendências conhecidas
Sem som · sem save · inimigos sem pathfinding e locais a cada cliente · mão esquerda quase escondida nas armas longas ·
finger/hand low-poly simples · rede não replica ataques · prompts 10 (piratas completos), 11 (canhões), 13–17 em `PROJECT_STATE.md`.

## 10. Índice de arquivos (gerado por `tools/map-index.py`)
- `client/src/boat/boat.js` (308l) Barco: um "set" de colisores que se move. A flutuação é calculada a partir das ondas e suavizada (inclinação limitada), então o barco nunca vira. Quem
  - exporta: Boat
  - métodos: addPiece, removePiece, recalcRadius, _makeDeckSlotMarkers, buildProgress, matchDeckSlot, setSailInstalled, countPlayersAboard, setSail, update, carry
- `client/src/boat/navigation.js` (85l) Sistema de navegação: linear durante a aventura, livre na batalha final. O barco segue uma rota principal com desvios controlados pelo jogador. Na bat
  - exporta: Navigation
  - métodos: unlockFree, updateSegment, getTargetYaw, phase, progress
- `client/src/boat/pieces.js` (55l) Catálogo de peças modulares. Para criar uma peça nova basta adicionar uma entrada aqui. size = [largura X, altura Y, comprimento Z]; col = tipo de col
  - exporta: makePieceMesh
- `client/src/build/build.js` (747l) 
  - exporta: Build
  - métodos: _setPickupTarget, updatePickupTarget, _makeRotationGizmo, tryPickup, _begin, _rayTargets, _pickupHitbox, _surfaceAtCursor, _setRayFromCursor, _surfaceNormal, _supportExtent, _physicsSize, _physicsOffset, _positionOnSurface, _updateHeldTarget, resetHeldPosition, _updateRotationGizmo, toggleRotationMode, beginGizmoDrag, beginCameraDrag, endCameraDrag, _updateGizmoDrag, _state, _endMode, place, cancel, canWeld, weld, _attachWelded, applyRemoteWeld
- `client/src/config.js` (15l) Troque PROD_SERVER pela URL do seu serviço no Render (wss://...).
- `client/src/core/input.js` (78l) Teclado + mouse. Usa pointer lock; se o navegador recusar, cai em "freeLook" (mouse move a câmera sem travar) e as setas também giram a câmera.
  - exporta: Input
  - métodos: setCursorMode, requestLock, endFrame
- `client/src/core/util.js` (30l) Rotação em Y (mesma convenção do Three: local -> mundo com +ângulo).
  - exporta: rot, lerpAngle, mulberry32, hash2
- `client/src/main.js` (249l) Ponto de entrada: monta a cena, cria os sistemas e roda o loop principal. G é o contexto compartilhado entre os módulos (cada sistema fica no seu arqu
- `client/src/net/net.js` (142l) Cliente multiplayer (WebSocket). Sem servidor o jogo roda igual em modo solo. Host (primeiro da sala) simula o barco; os outros interpolam. Posições a
  - exporta: Net
  - métodos: connect, handle, update
- `client/src/player/castaway.js` (243l) 
  - exporta: loadCastawayModel, createCastawayVisual, animateCastaway
- `client/src/player/model.js` (309l) 
  - exporta: makeHumanoid, animateHumanoid
- `client/src/player/player.js` (304l) Personagem em terceira pessoa: andar/correr/pular, nado, parkour (vault + agarrar/subir bordas com a mesma mecânica de "mantle") e câmera com colisão.
  - exporta: Player
  - métodos: setFirstPerson, setAppearance, applyAppearance, update, tryMantle, updateMantle, syncMesh, updateFirstPersonCamera, updateCamera, respawn
- `client/src/player/viewmodel-parts.js` (490l) Peças visuais da 1ª pessoa: mãos articuladas, braços com IK de dois ossos e os modelos detalhados de cada arma. Tudo aqui vive na cena do viewmodel (s
  - exporta: buildHand, buildArm, buildWeapon, buildBandage, buildMedkit, buildShell, buildCartridgeCase
- `client/src/player/viewmodel.js` (734l) Viewmodel em 1ª pessoa: braços, mãos e arma do JOGADOR LOCAL.  - Vive numa cena e câmera próprias, desenhadas por cima do mundo (depth limpo), então a
  - exporta: ViewModel
  - métodos: step, onSwing, onMeleeHit, onFire, onUse, onHurt, muzzleWorld, specFor, showWeapon, spawnCase, gripHand, weaponPoint, update, updateCycle, reloadPose, reloadHand, applyReloadParts, updateHeldItems, applyOverrides, render
- `client/src/systems/combat.js` (242l) Armas com raridade, atributos, munição e durabilidade usados pelo combate.
  - exporta: Combat
  - métodos: startWithRandomImprovisedWeapon, unlockWeapon, equip, select, cycle, setBuildMode, startReload, tracer, _useDurability, meleeStrike, fire, update
- `client/src/systems/enemies.js` (437l) IA de inimigos com máquina de estados reutilizável: idle -> patrulha -> (percepção) perseguição -> ataque / recuo -> procura -> morte. Só "pensam" a 5
  - exporta: Enemies
  - métodos: spawnForIsland, spawn, remove, damage, updatePirateWaves, spawnPirate, _makePirateRaft, _findPirateLanding, _startPirateGrapple, _updateHookVisual, _removeHook, _removeRaft, updatePirate, think, update
- `client/src/systems/interact.js` (131l) Interação com [E]: caixas de loot e mastro; [X]: peças soldadas.
  - exporta: Interact
  - métodos: find, openCrate, setCrateState, takeLoot, receiveLoot, closeCrate, update
- `client/src/systems/loot.js` (169l) 
  - exporta: generateCrateLoot, difficultyForCrateId, isGeneratedCrate
- `client/src/systems/startup.js` (324l) 
  - exporta: Startup
  - métodos: _makeClouds, _makeRain, begin, _transition, requestSailInstall, installSail, applyState, snapshot, _sync, _allPlayersAboard, update, _updateWeather, spawnPosition, objective
- `client/src/systems/survival.js` (66l) Vida e inventário simples (contadores por item).
  - exporta: Survival
  - métodos: add, use, damage, update
- `client/src/three.js` (3l) Ponto único de importação para manter o renderer e os loaders na mesma instância.
- `client/src/ui/hud.js` (125l) HUD em DOM: barras, inventário, arma, barco, bússola de ilha, avisos e status de construção física.
  - exporta: Hud
  - métodos: msg, flash, setBuild, openLoot, renderLoot, closeLoot, update
- `client/src/world/atmosphere.js` (153l) Atmosfera: céu em gradiente (domo), mapa de ambiente (IBL), sombras do sol que seguem a câmera e marcação automática de quem projeta/recebe sombra. O 
  - exporta: Atmosphere
  - métodos: _buildEnvironment, _computeState, _pushSky, update, markShadows
- `client/src/world/colliders.js` (118l) Colisão "gameplay-first": personagens são cilindros cinemáticos e o mundo é feito de conjuntos (sets) de colisores simples. Cada set tem posição/rotaç
  - exporta: Colliders, boxesOverlap
  - métodos: resolve, probe
- `client/src/world/models.js` (170l) Modelos procedurais de vegetação e rochas (baixo-poli com cor por vértice). Tudo é determinístico: recebe um gerador `rng` e só consome números dele.
  - exporta: makePalm, makeRock, makeBush, makeGrassTufts
- `client/src/world/ocean.js` (194l) Estado do mar. "level" = maré/enchente, "amp" = tempestade (escala a altura das ondas).
  - exporta: Ocean, waveHeight
  - métodos: update
- `client/src/world/physics.js` (557l) 
  - exporta: Physics
  - métodos: _bodyForMesh, _meshBounds, addFloatingObject, addRaftPiece, removeRaftPiece, hasRaftContact, addStaticSet, removeStaticSet, suspendObject, setHoldTarget, releaseHold, removeObject, resumeObject, placeObject, attachWeldedObject, detachWeldedObject, setRaftPose, _applyHold, _applyBuoyancy, _syncMesh, _syncPlayerCollider, snapshot, applySnapshot, update
- `client/src/world/sun.js` (99l) 
  - exporta: SunVisual
  - métodos: update, setStorm
- `client/src/world/textures.js` (46l) Texturas procedurais (sem arquivos): tábuas de madeira em tons de cinza; a cor da peça tinge a textura (material.color × map).
  - exporta: woodTexture, scaleBoxUVs
- `client/src/world/world.js` (534l) Mundo procedural por seed, gerado em chunks ao redor do barco: detritos flutuantes e ilhas com ruínas, caixotes e inimigos. A mesma seed gera sempre o
  - exporta: World
  - métodos: updateFloodLevel, ensureStarterIsland, update, makeChunk, applyPlacedState, applyCarryState, makeIsland, addStarterDeckParts, dropChunk, markCollected, applyCrateState, animateCrateOpen, openCrate, pushBoat, nearestIsland
- `server/server.js` (289l) Servidor multiplayer (Render). Guarda o estado compartilhado de cada sala: seed, host, peças construídas, detritos coletados, barco e posições dos jog
