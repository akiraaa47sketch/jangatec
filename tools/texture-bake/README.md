# Textura a partir de uma imagem de referência

Gera a textura de cor de um personagem (GLB com UVs, ex.: Meshy + Mixamo) projetando uma imagem
de referência de frente (pose A), e monta o GLB final do jogo.

```bash
pip install numpy pillow scipy
cd tools/texture-bake
python3 calib.py MODELO.glb referencia.png      # alinha silhueta do modelo com a imagem (mask.npy, calib.txt, overlay.png)
python3 bake.py MODELO.glb referencia.png basecolor.jpg   # textura 2048² (costas/nuca corrigidas)
python3 build.py MODELO.glb ../../client/assets/castaway-scout-animated.glb basecolor.jpg ../../client/assets/castaway-survivor.glb
```

`build.py` embute a textura e copia a animação `Attack` do modelo antigo (mesmos ossos Mixamo).
Confira `overlay.png`: amarelo = modelo e imagem coincidem; a projeção é boa a partir de ~90% de IoU.

## Modelo sem rig (ex.: Tripo .fbx) herdando o esqueleto de um modelo riggado

Usado para o náufrago atual: malha e textura da Tripo + esqueleto/animações do modelo Meshy.

1. Exporte a malha do FBX (posições, normais, UVs, índices) com o `FBXLoader` do three.js para
   `fbx_pos.bin`, `fbx_nor.bin`, `fbx_uv.bin`, `fbx_idx.bin` (Float32/Uint32), e extraia a textura
   embutida (`Color.jpg`).
2. `python3 align.py` — gira para +Z, converte para metros e confere as silhuetas com o modelo riggado.
3. `python3 transfer.py RIGGADO.glb TEMPLATE.glb Color.jpg SAIDA.glb` — copia os pesos dos vizinhos
   mais próximos (com normais compatíveis) e monta o GLB com esqueleto, skin e animações do template.

Os caminhos dentro de `align.py` apontam para os arquivos usados na época; ajuste antes de reutilizar.
