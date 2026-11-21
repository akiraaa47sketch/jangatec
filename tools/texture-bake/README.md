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
