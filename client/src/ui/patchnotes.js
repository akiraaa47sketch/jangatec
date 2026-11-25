// Notas de atualização (aba "Novidades" do menu). A primeira entrada é a versão atual: aparece
// aberta e com os destaques em cartões; as outras ficam recolhidas (clique para abrir).
// Para um patch novo: adicione um objeto NO TOPO da lista (com um `id` novo — o selo "NOVO" volta).
//   { id, versao, data, titulo, destaques?: [{ tag, titulo, texto }], secoes: [{ icone, nome, itens: [] }] }
// Nos textos, **assim** vira negrito.
export const PATCH_NOTES = [
  {
    id: '0.30', versao: 'v0.30', data: '25/11/2026', titulo: 'Inimigos armados balanceados',
    secoes: [
      { icone: '🔫', nome: 'Inimigos armados', itens: ['**Não atiram mais através de paredes**: a linha de visão é conferida em cada tiro (os piratas no convés atiravam através das paredes da jangada). O tiro do atirador de elite também para na parede.', '**Erram bem mais**: a pontaria começa ruim e melhora enquanto eles te veem (~1,6 s); perde mais com a distância e quando você anda ou corre. Tiro errado passa longe.', '**Dano por zona**: na **Zona Pirata** os tiros tiram 55–70% do dano normal; **Zona Militar 78%**; Zona 51 100%.', 'Pistoleiro pirata: 13 → **9** de dano (≈5 na Zona Pirata). Soldado e agente com pontaria menor.'] },
    ],
  },
  {
    id: '0.29', versao: 'v0.29', data: '25/11/2026', titulo: 'Seis eventos novos',
    destaques: [
      { tag: 'Evento', titulo: 'Águas-vivas bioluminescentes', texto: 'O céu escurece e dezenas de **águas-vivas brilhando** cercam a jangada, com o mar cintilando em volta. Lindo — mas quem cair na água leva queimadura.' },
      { tag: 'Seca', titulo: 'Galeão antigo', texto: 'Às vezes a seca revela um **galeão enorme enterrado na areia**. Entre pelo rombo do casco, passe pelas **armadilhas** e pelos **piratas-fantasma** e pegue o tesouro antes de a água voltar.' },
      { tag: 'Seca', titulo: 'Desembarque militar', texto: 'Da Zona Militar em diante, um **helicóptero** deixa **soldados de rapel** no fundo do mar para cercar a jangada encalhada.' },
    ],
    secoes: [
      { icone: '🌫', nome: 'Neblina', itens: ['Visão de ~20 m e **pedras escondidas** no caminho: bater numa estraga uma peça e quase para a jangada. Desvie com a vela.', 'Um **saco com loot raro** boia no meio da neblina.'] },
      { icone: '🏕', nome: 'Acampamento abandonado', itens: ['Numa ilha vazia à frente: barraca, fogueira apagada e **loot no chão**…', '…cercado de **armadilhas** (placas de espinhos e de dardo) e com um **baú-mímico** que acorda e morde.'] },
      { icone: '🏜', nome: 'Tempestade de areia', itens: ['Na seca: vento forte que **empurra**, areia no ar e visão curta.', 'O vento **desenterra sacos de loot** pela seca.'] },
      { icone: '🎲', nome: 'Frequência', itens: ['Na seca sai **no máximo um** evento (galeão 32%, areia 28%, desembarque 30% só da Zona Militar em diante).', 'Os eventos do mar entram no sorteio normal (águas-vivas um pouco mais raras; acampamento só com ilha vazia à frente).'] },
    ],
  },
  {
    id: '0.28', versao: 'v0.28', data: '25/11/2026', titulo: 'Mar mais calmo entre eventos',
    secoes: [
      { icone: '🌊', nome: 'Eventos do mar', itens: ['**Mais tempo entre eventos**: 2 min 10 s a 3 min 30 s depois do fim do anterior (antes 1 a 2 min).', 'O primeiro evento vem **50–90 s** depois da partida (antes 20–40 s).', 'Às vezes (10%) o mar fica quieto por mais um tempo.'] },
    ],
  },
  {
    id: '0.27', versao: 'v0.27', data: '25/11/2026', titulo: 'Mar gigante',
    destaques: [
      { tag: 'Eventos', titulo: 'Onda gigante de verdade', texto: 'A onda gigante virou uma **muralha de água de 16 a 24 m** (de propósito, fora da escala real), com espuma só na crista. A jangada sobe a parede inclinando bem mais.' },
      { tag: 'Eventos', titulo: 'Redemoinho colossal', texto: 'O redemoinho ficou **2 a 3× maior** (140–190 m de raio) e **muito mais fundo** (funil de 25–35 m), puxando mais forte. Perto das ilhas a água volta ao nível normal, então nenhuma ilha fica pendurada no buraco.' },
      { tag: 'Seca', titulo: 'Canhões e arpões no fundo do mar', texto: 'Canhões e a torreta-arpão **não saem mais de caixas**: ficam **jogados no chão da seca**, meio enterrados, com um **anel dourado** em volta. Pegue com [E].' },
    ],
    secoes: [
      { icone: '✨', nome: 'Reflexos', itens: ['Nova seção **Reflexos** nos Gráficos: Desligados, Só o céu, **Tempo real** (a cena em volta da jangada aparece refletida) e Tempo real ultra.', '**Metais refletem** de verdade: armas, canhões e peças de ferro.', '**Jangada molhada**: na chuva a madeira escurece, fica lisa e brilhante e surgem **poças** no convés refletindo o céu; no sol ela **seca aos poucos** (~45 s). Dá para desligar.'] },
      { icone: '🌧', nome: 'Chuva', itens: ['**Chuva nova**: gotas em **riscos** compridos, caindo rápido e inclinadas pelo vento (antes eram pontinhos que pareciam neve).', '**Respingos** onde a chuva bate na água e no convés; quanto mais forte a tempestade, mais grossa a chuva.'] },
      { icone: '🐟', nome: 'Peixes-voadores', itens: ['Bem mais **raros** (~1/5 da chance dos outros eventos).', '**Modelo novo**: dorso azul e barriga prateada, olhos grandes, "asas" com raios, nadadeiras e cauda bifurcada.'] },
      { icone: '⚡', nome: 'Raios', itens: ['Raios **muito mais visíveis**: tronco grosso com brilho, **galhos**, clarão na nuvem e no impacto, faíscas e 2–3 piscadas como raio de verdade.', 'Nas tempestades e no redemoinho os relâmpagos agora mostram o **raio caindo no mar** ao longe.'] },
      { icone: '💣', nome: 'Canhões e arpão', itens: ['Canhão improvisado em qualquer lugar do fundo; **canhão de ferro** do meio da rota em diante; **torreta-arpão** a partir da 2ª região (rara antes).'] },
    ],
  },
  {
    id: '0.26', versao: 'v0.26', data: '25/11/2026', titulo: 'Piratas nadadores e combate vivo',
    destaques: [
      { tag: 'Piratas', titulo: 'Piratas nadam', texto: 'Um golpe forte, um chute ou um pesado podem **jogar o pirata no mar**. Ele **nada de volta e escala a borda**. Se a jangada for embora rápido, ele fica para trás e afunda.' },
      { tag: 'Chefe da seca', titulo: 'Águas-vivas do escafandrista', texto: 'Nova habilidade: ele **arremessa águas-vivas** onde você está (5 quando furioso). Elas ficam no chão ~7 s; encostar deixa você **lento e perdendo 4 de vida por segundo** por 4 s.' },
    ],
    secoes: [
      { icone: '🏴‍☠️', nome: 'Piratas', itens: ['Corrigido o pirata que **teleportava para o meio da jangada** quando uma onda passava: agora ele só volta para o ponto de convés mais perto.', 'Piratas **nadam** quando caem no mar e sobem de volta pela borda.', 'Piratas atiradores também são **empurrados** pelos golpes.'] },
      { icone: '🤿', nome: 'Escafandrista', itens: ['O **jato que cega** agora funciona: acerta em qualquer ponto do caminho (antes só valia o ponto final da mira) e te empurra.', 'Nova habilidade **Águas-vivas** (lentidão + 4 de vida/s por 4 s), com ícone 🪼 na tela.'] },
      { icone: '⚔', nome: 'Combate', itens: ['Inimigos **reagem a cada golpe**: o corpo é jogado para o lado de onde veio o golpe, torce, os braços soltam e ele amassa com o impacto.', 'Golpe **pesado** ou **final do combo** que entra limpo **derruba**: cai de costas, quica e levanta.', 'Golpes fortes jogam o corpo bem mais que os fracos; chefes reagem menos.'] },
    ],
  },
  {
    id: '0.25', versao: 'v0.25', data: '25/11/2026', titulo: 'Cutscene revisada',
    secoes: [
      { icone: '🚁', nome: 'Cutscene de abertura', itens: ['**Mais calma** (~35 s): cada fala fica na tela tempo suficiente para ler e a queda dura mais.', 'Falas **revisadas** em português.', 'Corrigido o **congelamento no fim**: a luz da explosão da queda obrigava o jogo a recompilar os gráficos quando a cutscene acabava.', 'Se o mouse soltar durante a cutscene, aparece o aviso **"Clique na tela para controlar a câmera"**.'] },
    ],
  },
  {
    id: '0.24', versao: 'v0.24', data: '24/11/2026', titulo: 'A queda do helicóptero',
    destaques: [
      { tag: 'Cutscene', titulo: 'Abertura: o voo 47', texto: 'Toda partida começa num **helicóptero de resgate com todos os jogadores da sala**. Um raio acerta o rotor, ele cai em espiral e vocês despencam na ilha. Você **acorda em 1ª pessoa** ao lado dos destroços. Espaço ou clique pula.' },
      { tag: 'Mar', titulo: 'Ondas do norte e jangada colada na água', texto: 'As ondas agora **vêm só do norte**, a jangada **acompanha a água sem atraso** e, no multiplayer, todos usam **o relógio do servidor**: as ondas são iguais para todo mundo.' },
    ],
    secoes: [
      { icone: '🗺', nome: 'Zonas', itens: ['Ao entrar numa zona nova (**Zona Pirata, Zona Militar, Zona 51**) o nome aparece no meio da tela **na fonte do logo**, com fade in e fade out — inclusive ao acordar na ilha.', 'Saiu a **etiqueta fixa da zona** no topo da tela e o aviso grande no painel.'] },
      { icone: '🚁', nome: 'Ilha inicial', itens: ['**Destroços do helicóptero** na beira da ilha, pegando fogo e soltando fumaça (a cauda caiu na água).'] },
      { icone: '🌊', nome: 'Mar', itens: ['Ondas **só do norte**, num leque estreito.', 'Perto das ilhas a água é rasa e as ondas **perdem força**.', 'A jangada **sobe e desce junto com a onda** (antes chegava atrasada).', 'Multiplayer: **relógio acertado pelo servidor** e jangada **prevista entre pacotes** (sem trancos nem atraso por ping).'] },
      { icone: '🌀', nome: 'Ondas gigantes', itens: ['Onda gigante e ondas da tempestade **também vêm do norte**: dá para vê-las chegando pela proa.', 'Frente **mais íngreme** (parede de água) e encosta longa atrás.', 'A jangada **sobe a onda de verdade** em vez de ser engolida e subir depois.'] },
      { icone: '💧', nome: 'Enchente inicial', itens: ['A água **sobe suave** (sem pular para o nível máximo).', 'O chão da ilha **não some mais de uma vez**: fica visível debaixo da água rasa.', 'Para quem não é host a água **acompanha o host sem degraus**.'] },
    ],
  },
  {
    id: '0.16', versao: 'v0.16', data: '24/11/2026', titulo: 'BIG UPDATE: Zonas, Leviatã, Twins e 30 ilhas novas',
    destaques: [
      { tag: 'Mundo', titulo: 'Três zonas e 30 ilhas', texto: '**Zona Pirata** (fácil), **Zona Militar** (médio) e **Zona 51** (difícil), cada uma com **10 modelos de ilha** — construções, cômodos, tamanhos, cores e inimigos próprios. As ilhas agora são **morros de verdade**: dá para **subir a pé na seca** e a jangada **desvia sozinha** em vez de atolar.' },
      { tag: 'Fim da jornada', titulo: 'Plataforma Leviatã', texto: 'O SOS leva a uma **plataforma gigantesca de 4 andares** (topo a 53 m da água). Cada andar tem um **chefe com tema e habilidades próprias**; a escada do próximo andar só abre quando ele cai.' },
      { tag: 'Fim de jogo', titulo: 'Coordenadas do abrigo e os Twins', texto: 'Vencida a Leviatã, o rádio revela **o abrigo**: navegação **360°**, marcador na tela e o mar **não seca mais**. No caminho, **dois navios lendários** cercam a jangada pelos dois lados — afunde os dois para atracar.' },
      { tag: 'Batalha naval', titulo: 'Navio pirata invadível', texto: 'Navios com **colisão de verdade**: anda no convés, sobe pelas **escadas de corda** e o navio te leva junto. O de abordagem **encosta e baixa uma prancha**. Novo **canhão de ferro** e canhão improvisado bem mais cedo.' },
      { tag: 'Inimigos', titulo: 'Estilo e chefes furiosos', texto: 'Roupas e acessórios com **variações por tipo**, 4 inimigos novos na Zona 51, chefes com **mira preditiva**, **fúria abaixo de 50%** e combos. Efeitos de acerto, estouro e poeira por toda parte.' },
      { tag: 'Mar', titulo: 'Mar bem mais movimentado', texto: 'Eventos **a cada ~1–2 min**, tempestade com **ondas de 7–11 m**, seca de **55 s** e, na zona pirata, **torres de tralha e barracos de sucata** no meio do mar.' },
    ],
    secoes: [
      { icone: '🗺', nome: 'Zonas', itens: ['**Zona Pirata · fácil** (até ~1,7 km): piratas, duelistas, pistoleiros e bombardeiros.', '**Zona Militar · médio** (~1,7 a 2,55 km): soldados, escopeteiros, elites e brutamontes.', '**Zona 51 · difícil** (a partir de ~2,55 km): **Agente, Cientista louco, Mutante e Ciborgue**; a Leviatã só aparece aqui.', 'Zona e dificuldade no topo da tela, **aviso grande** ao entrar e céu/neblina com tom próprio.'] },
      { icone: '🏝', nome: 'Ilhas novas', itens: ['Ilhas viraram **morro contínuo**: platô, dunas na beira e encosta suave até o fundo (acabaram os discos). Formatos variados: alongada, com lóbulos, rochosa.', '**Pirata**: Cabana, Acampamento, **Vila** (3 casebres, poço, varal, canoa), **Taverna do Caolho**, **Rochedo do Farol** (sobe na galeria), **Praia do Naufrágio** (entra pelo rombo), **Ilha da Caveira**, Forte de Troncos, **Bateria de Canhões** e Forte de Sucata.', '**Militar**: Vigia, Bunker, **Radar**, **Heliponto**, **Quartel** (beliches), **Depósito** (contêineres), **Trincheiras** (ninho de metralhadora), **Artilharia**, **Torre de Comunicações** e a **Base Militar** gigante com a torre-espiral.', '**Zona 51**: Laboratório, **Cratera do OVNI**, **Observatório**, **Criogenia**, **Campo de Antenas**, **Reator**, **Quarentena**, **Monólito**, Bunker Restrito e a Base da Zona 51.', 'Tralha na praia de cada ilha: troncos, botes virados, barris, ouriços tcheco, placas e cristais.', 'Zona Pirata: **torres de tralha** e **barracos sobre palafitas** no meio do mar, com 1–2 inimigos e um caixote.'] },
      { icone: '⛵', nome: 'Jangada e navegação', itens: ['A jangada **desvia aos poucos** antes do raso (escorrega para o lado, não atola); parada perto da praia não é empurrada.', '**Controle 360°** no fim de jogo, com **marcador do abrigo** (seta e distância).', '**Ilha de resgate** com farol, posto de resgate, heliporto e cais.'] },
      { icone: '🛢', nome: 'Leviatã · 4 chefes', itens: ['**Soldador** (1º andar): maçarico em cone e poças de metal derretido.', '**Dr. Gás** (2º): nuvem tóxica e válvulas que soltam jatos.', '**Perfurador** (3º): investida da broca e tremor triplo.', '**Faísca** (topo): raios nos anéis azuis e salto relâmpago nas suas costas.', 'A barra de chefe mostra o chefe **do seu andar**.'] },
      { icone: '⚓', nome: 'Batalha naval', itens: ['Navio pirata com **colisão**, escadas de corda nos dois costados e convés que te leva junto; colide com jangada, ilhas e outros navios.', 'Abordagem **encosta de lado e baixa a prancha**; invadiu, a tripulação defende o convés.', '**Twins** (Rubro e Abissal): ficam em lados opostos, **bordada dupla**, **morteiro** ao trocar de posição, o que sobra fica furioso; deixam **loot lendário** e um canhão de ferro.', 'Efeitos: coluna d\'água, coroa de borrifo, esteira, navio afundando em chamas e **números de dano**.'] },
      { icone: '💣', nome: 'Canhões e destroços', itens: ['**Canhão improvisado bem mais cedo** (~24% das caixas, ~50% dos naufrágios, às vezes enterrado na seca).', 'Novo **canhão de ferro**: recarga 4,5 s e bala **~2× mais forte**.', '**Plataforma 6 × 6** bem menos rara e um pouco mais de paredes boiando.'] },
      { icone: '🌊', nome: 'Mar e eventos', itens: ['Primeiro evento em **20–40 s**, depois a cada **~1–2 min**; "mar quieto" quase nunca.', 'O furacão saiu: ficou o **redemoinho**, que gira e cospe a jangada (ninguém voa).', '**Tempestade de ondas gigantescas** (7–11 m) com chuva e raios — a jangada sobe a montanha com todo mundo a bordo.', 'Mar ensolarado mais agitado; ondas grandes não arrastam ninguém para fora.', '**Seca de 55 s** (mar cheio 2 min 30 s). O **escafandrista** (38% das secas) surge quando a água termina de baixar, **nunca na primeira seca**.', 'Kraken e navio-fantasma a partir de ~700 m; **SOS** com mais chance (até 3 por partida); invasões e batalhas navais mais frequentes.'] },
      { icone: '🎭', nome: 'Inimigos e chefes', itens: ['**2 a 4 variações** de roupa por tipo; chapéus novos (boina e capuz), coletes, jalecos, capas, mochilas e papagaios.', 'Chefes mais detalhados (maçarico com faíscas, frascos brilhando, broca girando, bobina com arcos, fita de balas, cilindros com bolhas).', 'Chefes com **mira preditiva**, **fúria** abaixo de 50% e **combos**.'] },
      { icone: '⚔', nome: 'Combate e efeitos', itens: ['Golpe com **ímã de alvo** e passo até o inimigo; combo mais rápido e clique guardado por mais tempo.', '**Faíscas e pedacinhos** da cor do inimigo a cada acerto, estouro com clarão ao cair e poeira na esquiva.'] },
      { icone: '👥', nome: 'Multiplayer', itens: ['Você **vê a arma de cada parceiro** na mão, trocando junto, com **clarão** no tiro.', 'O SOS agora aparece **para todos**.'] },
      { icone: '🛠', nome: 'Correções', itens: ['Inimigos **não perseguem mais através do chão/teto**; o alerta de um não acorda os de outro andar.', 'Depois das coordenadas do abrigo o mar **não seca mais** (nada de batalha interrompida).'] },
    ],
  },
  {
    id: '0.15', versao: 'v0.15', data: '24/11/2026', titulo: 'Novidades e plataformas grandes',
    destaques: [
      { tag: 'Menu', titulo: 'Aba Novidades', texto: 'O menu principal ganhou esta aba com **as notas de todas as atualizações**, da v0.1 até agora. O selo **NOVO** aparece sempre que sai um update.' },
      { tag: 'Construção', titulo: 'Plataformas grandes no mar', texto: 'A **plataforma de madeira 6 × 6 m** da ilha inicial agora também aparece **boiando no mar**. É rara (mais ou menos uma a cada 1 km), mas encaixa direto nos espaços do convés.' },
    ],
    secoes: [
      { icone: '📜', nome: 'Menu', itens: ['Aba **Novidades** com o histórico de versões; a mais nova fica aberta.', 'Selo **NOVO** ao lado da aba até você abrir a versão atual.'] },
      { icone: '🔨', nome: 'Construção', itens: ['**Plataforma grande** (6 × 6 m) aparece rara entre os destroços do mar.'] },
    ],
  },
  {
    id: '0.14', versao: 'v0.14', data: '24/11/2026', titulo: 'Fortaleza, SOS e mar vivo',
    destaques: [
      { tag: 'Nova base', titulo: 'Complexo militar com torre-espiral', texto: 'Uma ilha enorme murada, com torres de vigia, radomes e antenas. No centro, um prédio fechado sobe em **espiral por 16 salas**, com 1 a 3 inimigos em cada, até uma **esfera gigante** no topo: a arena do chefe da minigun, cheia de covers.' },
      { tag: 'Novo evento · fim da jornada', titulo: 'SOS: plataforma de petróleo', texto: 'Perto do fim da rota, o rádio capta um pedido de socorro. É uma **isca**: a plataforma está tomada, sala por sala, com o chefe no teto. Limpe tudo e o estoque deles fica na sala de rádio.' },
    ],
    secoes: [
      { icone: '🌊', nome: 'Mar e maré', itens: ['A jornada **começa com o mar cheio**; a seca não vem mais logo na saída.', 'Ciclo mais curto: **150 s de mar cheio, 90 s de seca**.', '**Ondas grandes** de vez em quando.', 'A jangada **não encalha mais** do lado das ilhas e contorna em vez de travar.', 'Itens que boiavam agora **caem** quando a água desce.', 'Água bem mais realista no gráfico **Ultra**.'] },
      { icone: '⚓', nome: 'Batalha naval', itens: ['Navios **reagem ao canhão**: adernam, balançam, soltam lascas e tábuas.', 'Tripulação perto do impacto **leva dano**; o capitão desvia em zigue-zague.', 'Casco furado deixa o navio **mais lento**.', '**Canhão** aparece no loot bem mais cedo (~850 m).'] },
      { icone: '⚔', nome: 'Inimigos', itens: ['**Menos empurrão** nos golpes.', 'Piratas na jangada **não caem mais** no mar (nem "teleportam").', 'Na seca eles caem e **voltam escalando** a jangada.', 'Bases com inimigos **espalhados pelas salas**, sem amontoado.'] },
      { icone: '🔨', nome: 'Construção', itens: ['A colisão **acompanha o giro** da peça.', '**Pegar objetos** mirando em qualquer parte deles.', '**Paredes maiores** (mais largas e mais altas).', 'Escada da torre de sucata **funciona**.'] },
      { icone: '🧭', nome: 'Progressão e loot', itens: ['Progressão **bem mais lenta**: o mar é maior e mais vazio.', '**Eventos do mar** começam já no primeiro minuto.', 'Menos caixas na seca e **loot mais escasso**.', 'Fundo da seca mais limpo.'] },
      { icone: '🔊', nome: 'Sons', itens: ['Tiro novo do **rifle de precisão** (com eco) e da **pistola**.', 'Som de **recarga da pistola** (recarga agora em 1,5 s).'] },
    ],
  },
  {
    id: '0.13', versao: 'v0.13', data: '23/11/2026', titulo: 'Facções e estruturas no mar',
    secoes: [
      { icone: '⚔', nome: 'Inimigos', itens: ['**Inimigos novos por facção** (piratas, soldados, sucateiros).', 'Piratas **descem a pé na seca** para caçar a jangada.', 'O Caranguejo-Rei saiu do jogo.'] },
      { icone: '🏗', nome: 'Mundo', itens: ['**Estruturas no meio do mar**: torre de sucata com morteiro e prédio afundado e inclinado.'] },
    ],
  },
  {
    id: '0.12', versao: 'v0.12', data: '23/11/2026', titulo: 'Chefes com habilidades',
    secoes: [
      { icone: '👑', nome: 'Chefes', itens: ['**Habilidades novas** para os chefes.'] },
      { icone: '⚓', nome: 'Jangada', itens: ['**Torreta-arpão** vira uma peça física para soldar no convés.', '**Arpão** no lugar do gancho.'] },
      { icone: '🩹', nome: 'Balanceamento', itens: ['**Menos curativos** no loot.'] },
    ],
  },
  {
    id: '0.11', versao: 'v0.11', data: '23/11/2026', titulo: 'Combate cadenciado',
    secoes: [
      { icone: '⚔', nome: 'Combate', itens: ['Combate **mais cadenciado**, com guarda depois do choque de armas.', 'Inimigos **mais espalhados e mais resistentes**.'] },
      { icone: '⛵', nome: 'Jangada', itens: ['Leme **pesado**: a jangada vira aos poucos.'] },
    ],
  },
  {
    id: '0.10', versao: 'v0.10', data: '23/11/2026', titulo: 'Até 6 náufragos e o Metralhador',
    secoes: [
      { icone: '👥', nome: 'Multiplayer', itens: ['Salas de **até 6 jogadores** com dificuldade que escala.'] },
      { icone: '👑', nome: 'Chefes', itens: ['Chefe **Metralhador** com minigun.', '**Chefes da seca** (escafandrista amaldiçoado).', 'Kraken novo.'] },
      { icone: '🌊', nome: 'Mar', itens: ['Raios com **ondas gigantes**.', 'Nadar **gasta estamina**.', 'Defesa e parry melhores.'] },
    ],
  },
  {
    id: '0.9', versao: 'v0.9', data: '23/11/2026', titulo: 'Criaturas do mar',
    secoes: [
      { icone: '🐙', nome: 'Eventos do mar', itens: ['**Kraken**, **tubarões**, **peixes voadores**, **tempestade de raios** e **navio-fantasma**.', 'Naufrágio no redemoinho do furacão.'] },
      { icone: '👥', nome: 'Multiplayer', itens: ['**Inimigos sincronizados** (o host simula).'] },
      { icone: '🎒', nome: 'Inventário', itens: ['Arrastar itens, **largar no mundo** e trava do corpo na câmera.'] },
      { icone: '🎨', nome: 'Menu', itens: ['Menu principal e tela de personagem refeitos.', 'Esquiva mais curta e animação do ataque carregado.'] },
    ],
  },
  {
    id: '0.8', versao: 'v0.8', data: '22/11/2026', titulo: 'IA justa e HUD limpo',
    secoes: [
      { icone: '⚔', nome: 'Combate', itens: ['IA de combate **mais justa**: os inimigos se revezam e esperam a vez.'] },
      { icone: '🖥', nome: 'Interface', itens: ['**HUD mais limpo**.', 'Barra de inventário com **teclas configuráveis**.'] },
    ],
  },
  {
    id: '0.7', versao: 'v0.7', data: '22/11/2026', titulo: 'Bases variadas e construção de verdade',
    secoes: [
      { icone: '🏝', nome: 'Mundo', itens: ['**Bases variadas** pela distância e a primeira **base militar** com soldados.', 'Caixotes na seca.'] },
      { icone: '🔨', nome: 'Construção', itens: ['**Peças de construção de verdade** e **escada de mão**.'] },
      { icone: '⚔', nome: 'Combate', itens: ['Cone de visão dos inimigos e morteiro sem tiro à queima-roupa.', '**Recuo** nas armas de fogo; FOV e sensibilidade por câmera.'] },
      { icone: '🍫', nome: 'Sobrevivência', itens: ['**Comidas com buffs**.'] },
      { icone: '👥', nome: 'Multiplayer', itens: ['Peça arrastada sincronizada, **invasão por abordagem** e eventos mais frequentes.'] },
    ],
  },
  {
    id: '0.6', versao: 'v0.6', data: '22/11/2026', titulo: 'Roupas e martelo 3D',
    secoes: [
      { icone: '👕', nome: 'Personagem', itens: ['**Roupas, chapéus e acessórios** para a pílula.', 'Rosto mais alto, na cabeça.'] },
      { icone: '🔨', nome: 'Armas', itens: ['**Martelo** com modelo 3D novo.', 'Mesma pegada de sabre para todas as armas brancas.'] },
      { icone: '🎞', nome: 'Animações', itens: ['Mãos 3D em 3ª pessoa e **nado de peito** em 1ª pessoa.'] },
    ],
  },
  {
    id: '0.5', versao: 'v0.5', data: '22/11/2026', titulo: 'Armas 3D, fortes de sucata e sons',
    secoes: [
      { icone: '🔫', nome: 'Armas', itens: ['**Pistola, revólver e rifle de precisão** com modelos 3D novos.', 'Mãos 3D realistas na 1ª pessoa que **seguram as armas direito**.'] },
      { icone: '🏝', nome: 'Mundo', itens: ['**Fortes de sucata** com torres de morteiro que desabam.', 'Acampamentos novos nas ilhas e **linha de visão** dos inimigos.'] },
      { icone: '⚔', nome: 'Combate', itens: ['**Combate de espadas** e torreta-gancho.'] },
      { icone: '🔊', nome: 'Sons', itens: ['**Efeitos sonoros**.'] },
      { icone: '⌨', nome: 'Controles', itens: ['**Teclas configuráveis** e build assistida.'] },
    ],
  },
  {
    id: '0.4', versao: 'v0.4', data: '21/11/2026', titulo: 'Tempestade forte',
    secoes: [
      { icone: '🌪', nome: 'Clima', itens: ['**Tempestade forte** e empurrão no furacão.', 'Nuvens sem o giro maluco.'] },
      { icone: '🎞', nome: 'Visual', itens: ['Animações novas em 3ª pessoa, pílula menor e **rosto animado**.', 'Otimização e modos do FSR.'] },
    ],
  },
  {
    id: '0.3', versao: 'v0.3', data: '21/11/2026', titulo: 'Batalhas navais e chat de voz',
    secoes: [
      { icone: '⚓', nome: 'Batalha naval', itens: ['**Canhão improvisado**, **navios piratas destrutíveis** e vida por peça da jangada.'] },
      { icone: '🎒', nome: 'Itens', itens: ['Loot que boia, **gancho**, **banjo que cura** e **martelo de conserto**.'] },
      { icone: '⚔', nome: 'Combate', itens: ['**Corpo a corpo elaborado**, mais rápido e variado.', 'Jogador caído no multiplayer.'] },
      { icone: '👥', nome: 'Multiplayer', itens: ['**Chat de voz** e navegador de servidores com senha.', 'Menu principal novo e logo **Jangatec**.'] },
      { icone: '🎥', nome: 'Imersão', itens: ['Opcional: tremor de câmera, profundidade de campo e desfoque de movimento.', 'Redemoinho no furacão.'] },
    ],
  },
  {
    id: '0.2', versao: 'v0.2', data: '21/11/2026', titulo: 'A pílula e as opções gráficas',
    secoes: [
      { icone: '💊', nome: 'Personagem', itens: ['**A pílula** vira o personagem; inimigos são **pílulas malvadas**.'] },
      { icone: '🔫', nome: 'Armas', itens: ['**Armas novas**, red dot, zoom e mira sobre o ombro.'] },
      { icone: '🖥', nome: 'Gráficos', itens: ['**Opções gráficas**, contador de FPS e upscaler estilo **FSR**.', 'Benchmark.'] },
    ],
  },
  {
    id: '0.1', versao: 'v0.1', data: '21/11/2026', titulo: 'O começo da jornada',
    secoes: [
      { icone: '🌊', nome: 'O oceano', itens: ['**Ciclo de maré**: o mar seca e enche.', '**Fundo do mar explorável** na seca.', 'Itens pesados afundam.'] },
      { icone: '⛵', nome: 'Jogo', itens: ['Construa a jangada, sobreviva à inundação e **zarpe**.', 'Eventos do mar, balanceamento e texturas.'] },
      { icone: '📱', nome: 'Plataformas', itens: ['**Controles de toque** e HUD novo.'] },
    ],
  },
];
export const NEWS_VERSION = PATCH_NOTES[0].id;

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

function sections(p) {
  return `<div class="news-grid">${p.secoes.map((s) => `<section><h3>${esc(s.icone)} ${esc(s.nome)}</h3><ul>${s.itens.map((i) => `<li>${md(i)}</li>`).join('')}</ul></section>`).join('')}</div>`;
}

export function renderPatchNotes(root) {
  root.innerHTML = PATCH_NOTES.map((p, i) => {
    const head = `<span class="news-ver">${esc(p.versao)}</span><span class="news-title">${esc(p.titulo)}</span><span class="news-date">${esc(p.data)}</span>${i === 0 ? '<span class="news-now">Atual</span>' : ''}`;
    const hero = p.destaques ? `<div class="news-hero">${p.destaques.map((d) => `<article class="news-big"><span class="news-tag">${esc(d.tag)}</span><h3>${esc(d.titulo)}</h3><p>${md(d.texto).replace(/<b>/g, '<strong>').replace(/<\/b>/g, '</strong>')}</p></article>`).join('')}</div>` : '';
    return `<details class="news-patch"${i === 0 ? ' open' : ''}><summary>${head}</summary>${hero}${sections(p)}</details>`;
  }).join('');
}
