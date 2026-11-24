// 10 MODELOS DE ILHA por zona. Cada modelo muda o formato do morro (tamanho, alongamento, lóbulos,
// largura da praia, encosta de pedra), as cores, a vegetação, as tralhas da praia e o acampamento
// (construções com cômodos de tamanhos diferentes — ver world/camp.js).
//   site   = tipo de acampamento (buildCamp / buildScrapCamp)
//   R      = raio do platô [mín, máx]   W = largura da encosta   e = alongamento   la/lk = lóbulos
//   rocky  = quanto da encosta é pedra  grassK = até onde vai a grama no platô
//   palms/bushes/tufts = multiplicadores da vegetação   ruins = chance de ruína de alvenaria
//   boulders = pedras grandes na encosta   beach = tralha da praia (decoração)
//   minDiff = dificuldade mínima (a zona pirata fácil não tem os fortes logo no começo)
export const ZONE_PAL = {
  pirata: { grass: 0x6f9d4c, sand: 0xdcc891, wet: 0xb3a275, deep: 0xa08e69, rock: 0x7d7466 },
  militar: { grass: 0x8a8f55, sand: 0xcdbd90, wet: 0xa89a72, deep: 0x9a8a68, rock: 0x6f6a5e },
  z51: { grass: 0x6a6d5c, sand: 0xa49c8c, wet: 0x847c6e, deep: 0x8a8070, rock: 0x55524c },
};

export const ISLAND_TYPES = {
  pirata: [
    { id: 'cabana', nome: 'Ilha da Cabana', site: 'hut', w: 1.2, R: [9, 12], W: [15, 19], e: [0, 0.25], la: [0, 0.12], palms: 1, ruins: 0.5, beach: 'drift' },
    { id: 'acampamento', nome: 'Acampamento Pirata', site: 'tendas', w: 1.1, R: [10, 13], W: [15, 18], e: [0.1, 0.3], la: [0.05, 0.15], palms: 0.9, ruins: 0.3, beach: 'drift' },
    { id: 'vila', nome: 'Vila dos Piratas', site: 'vila', w: 1, R: [13, 16], W: [16, 20], e: [0, 0.2], la: [0.12, 0.25], lk: 3, palms: 1.3, bushes: 1.3, ruins: 0.2, beach: 'boats', pal: { grass: 0x5f9a44 } },
    { id: 'taverna', nome: 'Taverna do Caolho', site: 'taverna', w: 1, R: [11, 14], W: [15, 19], e: [0.05, 0.3], la: [0, 0.15], palms: 1.2, ruins: 0.2, beach: 'barrels', pal: { grass: 0x65a14a } },
    { id: 'farol', nome: 'Rochedo do Farol', site: 'farol', w: 0.9, R: [8.5, 11], W: [11, 13], e: [0, 0.15], la: [0.1, 0.2], lk: 4, rocky: 0.85, grassK: 0.5, palms: 0.35, bushes: 0.6, tufts: 0.6, boulders: 6, ruins: 0, beach: 'rocks', pal: { grass: 0x6d8f4e, sand: 0xc9b98c } },
    { id: 'naufragio', nome: 'Praia do Naufrágio', site: 'naufragio', w: 1, R: [11, 13.5], W: [19, 23], e: [0.4, 0.6], la: [0, 0.1], palms: 0.7, tufts: 0.7, ruins: 0, beach: 'drift', grassK: 0.45, pal: { sand: 0xe4d29c } },
    { id: 'tesouro', nome: 'Ilha da Caveira', site: 'tesouro', w: 0.9, R: [9.5, 12], W: [13, 16], e: [0.1, 0.25], la: [0.2, 0.32], lk: 2, rocky: 0.5, palms: 0.6, bushes: 1.2, boulders: 4, ruins: 0, beach: 'rocks', pal: { grass: 0x7a9a52 } },
    { id: 'forte', nome: 'Forte de Troncos', site: 'fort', w: 1.1, minDiff: 1, R: [11, 15], W: [15, 19], e: [0, 0.2], la: [0, 0.15], palms: 0.9, ruins: 0.3, beach: 'drift' },
    { id: 'canhoneira', nome: 'Bateria de Canhões', site: 'canhoneira', w: 0.9, minDiff: 1, R: [11, 14], W: [13, 16], e: [0.1, 0.3], la: [0.05, 0.15], rocky: 0.35, palms: 0.7, boulders: 2, ruins: 0.2, beach: 'balls' },
    { id: 'sucata', nome: 'Forte de Sucata', site: 'scrap', w: 0.9, minDiff: 1, R: [12, 15], W: [15, 18], e: [0, 0.2], la: [0, 0.12], palms: 0.6, ruins: 0, beach: 'junk', pal: { grass: 0x77935a } },
  ],
  militar: [
    { id: 'vigia', nome: 'Posto de Vigia', site: 'vigia', w: 1, R: [9, 12], W: [14, 17], e: [0, 0.25], la: [0, 0.12], palms: 0.5, ruins: 0.3, beach: 'hedgehog' },
    { id: 'bunker', nome: 'Bunker Costeiro', site: 'bunker', w: 1.1, R: [10, 13], W: [13, 16], e: [0.1, 0.3], la: [0, 0.12], rocky: 0.3, palms: 0.4, boulders: 2, ruins: 0.3, beach: 'hedgehog' },
    { id: 'radar', nome: 'Estação de Radar', site: 'radar', w: 1, R: [9.5, 12], W: [12, 15], e: [0, 0.2], la: [0.1, 0.2], lk: 3, rocky: 0.55, grassK: 0.55, palms: 0.2, boulders: 4, ruins: 0, beach: 'rocks' },
    { id: 'heliponto', nome: 'Heliponto', site: 'heliponto', w: 1, R: [11, 13.5], W: [14, 17], e: [0.15, 0.35], la: [0, 0.1], palms: 0.3, tufts: 0.5, ruins: 0, beach: 'hedgehog', pal: { grass: 0x80865a } },
    { id: 'quartel', nome: 'Quartel', site: 'quartel', w: 1, R: [11, 14], W: [14, 18], e: [0.2, 0.4], la: [0, 0.1], palms: 0.4, ruins: 0.2, beach: 'hedgehog' },
    { id: 'deposito', nome: 'Depósito de Munição', site: 'deposito', w: 1, R: [11, 13.5], W: [14, 17], e: [0.1, 0.3], la: [0.05, 0.15], palms: 0.3, tufts: 0.6, ruins: 0, beach: 'barrels', pal: { grass: 0x8f9058 } },
    { id: 'trincheira', nome: 'Linha de Trincheiras', site: 'trincheira', w: 1, R: [10.5, 13], W: [16, 20], e: [0.25, 0.45], la: [0, 0.1], palms: 0.3, bushes: 0.8, ruins: 0.4, beach: 'hedgehog', pal: { grass: 0x7d8150, sand: 0xc2b088 } },
    { id: 'artilharia', nome: 'Posto de Artilharia', site: 'artilharia', w: 1, R: [10.5, 13], W: [13, 16], e: [0, 0.2], la: [0.1, 0.2], rocky: 0.4, palms: 0.3, boulders: 3, ruins: 0.2, beach: 'balls' },
    { id: 'comunicacoes', nome: 'Torre de Comunicações', site: 'comunicacoes', w: 1, R: [9, 11.5], W: [12, 15], e: [0, 0.15], la: [0.1, 0.2], lk: 4, rocky: 0.6, palms: 0.2, boulders: 5, ruins: 0, beach: 'rocks' },
    { id: 'base', nome: 'Base Militar', site: 'militar', w: 0.7, lonely: true, R: [47, 47], W: [18, 22], e: [0, 0.06], la: [0, 0.04], palms: 0.5, ruins: 0, beach: 'hedgehog' },
  ],
  z51: [
    { id: 'lab', nome: 'Laboratório Secreto', site: 'lab', w: 1.3, R: [11, 14], W: [14, 17], e: [0, 0.2], la: [0, 0.12], palms: 0, ruins: 0.2, beach: 'signs' },
    { id: 'ovni', nome: 'Cratera do OVNI', site: 'ovni', w: 1.1, R: [12, 14.5], W: [14, 18], e: [0.05, 0.25], la: [0.1, 0.22], lk: 3, rocky: 0.45, boulders: 4, palms: 0, ruins: 0, beach: 'shards', pal: { grass: 0x5a5d50 } },
    { id: 'domo', nome: 'Observatório', site: 'domo', w: 1, R: [9.5, 12], W: [12, 14], e: [0, 0.15], la: [0.1, 0.2], lk: 4, rocky: 0.7, grassK: 0.5, boulders: 5, palms: 0, ruins: 0, beach: 'rocks' },
    { id: 'criogenia', nome: 'Centro de Criogenia', site: 'criogenia', w: 1, R: [10.5, 13], W: [14, 17], e: [0.2, 0.4], la: [0, 0.1], palms: 0, ruins: 0, beach: 'signs', pal: { sand: 0xb3b0a8, grass: 0x6a7068 } },
    { id: 'antenas', nome: 'Campo de Antenas', site: 'antenas', w: 1, R: [11, 13.5], W: [14, 17], e: [0.1, 0.3], la: [0.05, 0.15], palms: 0, ruins: 0, beach: 'signs' },
    { id: 'reator', nome: 'Reator Experimental', site: 'reator', w: 0.9, R: [11, 13.5], W: [13, 16], e: [0, 0.2], la: [0.1, 0.18], rocky: 0.3, boulders: 2, palms: 0, ruins: 0, beach: 'barrels', pal: { grass: 0x5d6450, sand: 0x948e7e } },
    { id: 'quarentena', nome: 'Zona de Quarentena', site: 'quarentena', w: 1, R: [10.5, 13], W: [14, 18], e: [0.15, 0.35], la: [0, 0.12], palms: 0, ruins: 0.2, beach: 'barrels' },
    { id: 'monolito', nome: 'Campo do Monólito', site: 'monolito', w: 0.9, R: [10.5, 13], W: [15, 18], e: [0, 0.2], la: [0.05, 0.15], grassK: 0.8, palms: 0, tufts: 1.4, ruins: 0, beach: 'shards', pal: { grass: 0x6a7a4c } },
    { id: 'bunker51', nome: 'Bunker Restrito', site: 'bunker', w: 0.8, R: [10, 12.5], W: [13, 16], e: [0.1, 0.3], la: [0.05, 0.15], rocky: 0.4, boulders: 3, palms: 0, ruins: 0.3, beach: 'hedgehog' },
    { id: 'base51', nome: 'Base da Zona 51', site: 'militar', w: 0.6, lonely: true, R: [47, 47], W: [18, 22], e: [0, 0.06], la: [0, 0.04], palms: 0, ruins: 0, beach: 'signs' },
  ],
};

// Sorteia o modelo da ilha (roll em [0,1) do RNG da ilha). lonely = chunk sem ilhas vizinhas.
export function pickIslandType(zoneId, diff, roll, lonely) {
  const list = (ISLAND_TYPES[zoneId] || ISLAND_TYPES.pirata).filter((t) => (!t.lonely || lonely) && diff >= (t.minDiff || 0));
  const total = list.reduce((a, t) => a + t.w, 0);
  let k = roll * total;
  for (const t of list) { k -= t.w; if (k <= 0) return t; }
  return list[list.length - 1];
}
