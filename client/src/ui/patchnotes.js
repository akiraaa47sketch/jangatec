// Notas de atualização (aba "Novidades" do menu). A primeira entrada é a versão atual: aparece
// aberta e com os destaques em cartões; as outras ficam recolhidas (clique para abrir).
// Para um patch novo: adicione um objeto NO TOPO da lista (com um `id` novo — o selo "NOVO" volta).
//   { id, versao, data, titulo, destaques?: [{ tag, titulo, texto }], secoes: [{ icone, nome, itens: [] }] }
// Nos textos, **assim** vira negrito.
export const PATCH_NOTES = [
  {
    id: '0.20', versao: 'v0.20', data: '24/11/2026', titulo: 'Inimigos com estilo e chefes furiosos',
    destaques: [
      { tag: 'Inimigos', titulo: 'Cada um com a sua roupa', texto: 'Os inimigos agora usam **roupas, chapéus e acessórios** com **variações temáticas por tipo**: bucaneiros com papagaio, grumetes de marinheiro, fuzileiros de boina, atiradores camuflados de capuz, cavalheiros de cartola, catadores de mochila e muito mais.' },
      { tag: 'Chefes', titulo: 'Fúria e mira esperta', texto: 'Os chefes **miram onde você vai estar** e, abaixo de **50% de vida, ficam enfurecidos**: aura vermelha, habilidades mais rápidas, **combos** e versões mais fortes dos ataques.' },
    ],
    secoes: [
      { icone: '🎭', nome: 'Visual dos inimigos', itens: ['**2 a 4 variações** por tipo (pirata, soldado, duelista, saqueador, atirador, fantasma...).', 'Chapéus novos: **boina** e **capuz**.', 'Coletes táticos, casacos, jalecos, capas, mochilas, bandoleiras e papagaios.'] },
      { icone: '👑', nome: 'Chefes mais detalhados', itens: ['**Soldador**: avental de couro, ombreiras, mangueira e faíscas no maçarico.', '**Dr. Gás**: jaleco, frascos brilhando e vazamento de gás.', '**Perfurador**: colete refletivo, **broca girando** e fumaça no escapamento.', '**Faísca**: casaco escuro, **arcos elétricos** na bobina e visor piscando.', '**Metralhador**: colete, caixa de munição e fita de balas.', '**Escafandrista**: cilindros de ar, cinto de chumbo e bolhas.'] },
      { icone: '🧠', nome: 'IA dos chefes', itens: ['**Mira preditiva** nas habilidades de longe.', '**Fúria** abaixo de 50%: maçarico que **varre**, mais poças e raios, mais válvulas, **investida e salto em dobro**, tremor com mais ondas.', '**Combos**: uma habilidade emenda na outra quando furioso.'] },
      { icone: '✨', nome: 'Efeitos visuais', itens: ['**Faíscas e pedacinhos** da cor do inimigo a cada acerto.', '**Estouro** com clarão e anel quando um inimigo cai.', '**Poeira** na esquiva e nas quedas.', 'Brasas, ondas de choque, raios e anéis em todas as habilidades dos chefes.'] },
    ],
  },
  {
    id: '0.19', versao: 'v0.19', data: '24/11/2026', titulo: 'Mar bravo e canhão de ferro',
    destaques: [
      { tag: 'Evento', titulo: 'Tempestade de ondas gigantescas', texto: 'As ondas desse evento agora têm **7 a 11 m** — maiores que a onda gigante — e vêm com **chuva forte e raios**. A jangada **sobe e desce a montanha inteira** com todo mundo a bordo (acabou o "segure no mastro").' },
      { tag: 'Multiplayer', titulo: 'Armas dos parceiros', texto: 'Agora você **vê a arma na mão de cada parceiro**, ela troca quando ele troca de arma, some no modo construção e **pisca no tiro**.' },
    ],
    secoes: [
      { icone: '💣', nome: 'Canhões', itens: ['**Canhão improvisado bem mais cedo** (~24% das caixas e ~50% dos naufrágios logo no começo).', 'Novo **canhão de ferro** do meio do jogo: **recarga 4,5 s** e bala **~2× mais forte**.', 'Os Twins agora deixam um canhão de ferro.'] },
      { icone: '🌊', nome: 'Mar', itens: ['Mar ensolarado **mais agitado**: ondulação maior e mais frequente, jangada balança mais.', 'Ondas grandes **não arrastam** mais ninguém para fora da jangada.'] },
      { icone: '🪵', nome: 'Destroços', itens: ['**Plataforma 6 × 6** bem menos rara.', 'Um pouco **mais de paredes** boiando.'] },
      { icone: '👥', nome: 'Multiplayer', itens: ['Modelo da **arma do parceiro** na mão (e o banjo no peito).', '**Clarão** na arma do parceiro quando ele atira.'] },
    ],
  },
  {
    id: '0.18', versao: 'v0.18', data: '24/11/2026', titulo: 'Rumo ao abrigo: os Twins',
    destaques: [
      { tag: 'Fim de jogo', titulo: 'Coordenadas do abrigo', texto: 'Derrubando os quatro chefes da Leviatã, o rádio do topo revela **as coordenadas de um abrigo**. A jangada ganha **navegação 360°** (a vela vira o leme) e um **marcador no topo da tela** mostra direção e distância.' },
      { tag: 'Chefe naval', titulo: 'Os Twins', texto: 'Perto do abrigo, **dois navios lendários** fecham o caminho. Eles **cercam a jangada pelos dois lados** e disparam **bordadas juntos**; enquanto trocam de posição, atacam com **morteiro**. Afunde os dois para poder atracar.' },
    ],
    secoes: [
      { icone: '⚓', nome: 'Os Twins', itens: ['**Twin Rubro** e **Twin Abissal**: velas brilhando, casco escuro com friso dourado.', 'Tentam ficar **em lados opostos** da jangada; trocam de posição só de tempos em tempos.', 'Reposicionando: **morteiro** (anel vermelho onde vai cair).', 'Em posição: **bordada dupla** sincronizada.', 'Sobrou um? Ele fica **furioso** e ataca mais rápido.', 'Deixam **loot lendário** boiando.'] },
      { icone: '🧭', nome: 'Navegação', itens: ['**Controle 360°** só no fim de jogo (antes abria sozinho aos 2,1 km).', 'Marcador do **abrigo** com seta e distância.', '**Ilha de resgate** com farol girando, posto de resgate, heliporto e cais.'] },
      { icone: '💥', nome: 'Efeitos navais', itens: ['Impacto na água com **coluna alta, coroa de borrifo e anel de espuma**.', 'Navios com **esteira e borrifo de proa**.', 'Navio afundando com **explosões e chamas** no convés.', '**Números de dano** quando seu tiro de canhão acerta.', 'Bordada **aderna o navio** com o coice.'] },
    ],
  },
  {
    id: '0.17', versao: 'v0.17', data: '24/11/2026', titulo: 'Leviatã: quatro andares, quatro chefes',
    destaques: [
      { tag: 'Fim da jornada', titulo: 'Plataforma Leviatã', texto: 'O SOS agora leva a uma **plataforma gigantesca de 4 andares** (~82 × 82 m, topo a 53 m da água e torre de perfuração de ~110 m). Cada andar tem um **chefe com tema e habilidades próprias**, e a escada para o próximo andar só abre quando o chefe cai. Derrote os quatro e o arsenal deles é seu.' },
      { tag: 'Combate', titulo: 'Golpes mais responsivos', texto: 'O golpe agora **puxa você até o inimigo da frente** e acerta mesmo com a mira um pouco fora. O combo **emenda mais rápido** e os cliques guardados não se perdem.' },
    ],
    secoes: [
      { icone: '🔥', nome: '1º andar · O Soldador', itens: ['**Maçarico**: cone de fogo marcado no chão — saia dele.', '**Respingo de solda**: poças de metal derretido que queimam.'] },
      { icone: '☣', nome: '2º andar · Dr. Gás', itens: ['**Nuvem tóxica**: dói e embaça a vista.', '**Válvulas**: três faixas no chão soltam jatos de gás — fique entre elas.'] },
      { icone: '⛏', nome: '3º andar · O Perfurador', itens: ['**Investida da broca**: ele dispara pela faixa vermelha.', '**Tremor triplo**: pule as três ondas de choque.'] },
      { icone: '⚡', nome: 'Topo · Faísca', itens: ['**Arco elétrico**: raios caem nos anéis azuis.', '**Salto relâmpago**: reaparece nas suas costas com um choque.'] },
      { icone: '⚔', nome: 'Combate', itens: ['**Ímã de alvo** e passo até o inimigo ao golpear.', 'Combo **mais rápido**; clique guardado por mais tempo.', 'A barra de chefe mostra o chefe **do seu andar**.'] },
      { icone: '🛠', nome: 'Correções', itens: ['O SOS agora **aparece para todos** no multiplayer.'] },
    ],
  },
  {
    id: '0.16', versao: 'v0.16', data: '24/11/2026', titulo: 'Abordagem de verdade',
    destaques: [
      { tag: 'Batalha naval', titulo: 'Navio pirata sólido e invadível', texto: 'O navio pirata agora tem **colisão de verdade**: dá para andar no convés, subir pelas **escadas de corda** (até nadando) e o navio te leva junto. O de abordagem **encosta de lado e baixa uma prancha** em vez de atravessar a jangada. Invadiu? A **tripulação larga a abordagem e defende o convés**.' },
      { tag: 'Eventos', titulo: 'Mar mais agitado, sem furacão', texto: 'Os **eventos aleatórios aparecem bem mais vezes**. O furacão saiu: ficou só o **redemoinho na água**, que puxa a jangada mas **não empurra nem arremessa você**.' },
    ],
    secoes: [
      { icone: '⚓', nome: 'Navio pirata', itens: ['Casco, convés, castelo, mastros e amuradas **com colisão**.', '**Escadas de corda** nos dois costados.', 'Quem está no convés **vai junto** com o navio.', 'Colide com a **jangada**, com **ilhas** e com **outros navios**.', 'Abordagem: encosta **de lado, com folga**, e baixa a **prancha**.', 'Continua **destrutível**: afunda e leva quem estiver em cima.'] },
      { icone: '🌊', nome: 'Eventos', itens: ['Primeiro evento em **30–60 s**; depois a cada **~2–3 min**.', '**Furacão virou redemoinho**: sem vento, sem tornado, sem raios.', 'Ser engolido pelo redemoinho só gira e cospe a jangada (ninguém voa).'] },
      { icone: '💣', nome: 'Canhão', itens: ['Aparece **desde o começo**: ~13% das caixas, ~40% dos naufrágios e às vezes **enterrado na seca**.'] },
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
