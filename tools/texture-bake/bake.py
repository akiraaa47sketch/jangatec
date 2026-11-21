import numpy as np, sys
from PIL import Image
from scipy import ndimage
from glb import load, acc
GLB, IMG, OUT = sys.argv[1:4]
T = 2048
j, b = load(GLB)
pr = j['meshes'][0]['primitives'][0]
P = acc(j, b, pr['attributes']['POSITION']).astype(np.float64)
N = acc(j, b, pr['attributes']['NORMAL']).astype(np.float64)
UV = acc(j, b, pr['attributes']['TEXCOORD_0']).astype(np.float64)
I = acc(j, b, pr['indices']).reshape(-1, 3).astype(np.int64)
sx, ox, top, bot = [float(v) for v in open('calib.txt').read().split()]
s = (bot - top) / 1.7
im = np.asarray(Image.open(IMG).convert('RGB')).astype(np.float32)
mask = np.load('mask.npy')
# fundo -> cor do pixel de silhueta mais próximo (bordas laterais não puxam o preto do fundo)
mask_in = ndimage.binary_erosion(mask, iterations=3)
_, (iy, ix) = ndimage.distance_transform_edt(~mask_in, return_indices=True)
img = im[iy, ix]
H, W = mask.shape
def sample(x, y):
    u = np.clip(x * sx * s + ox, 0, W - 1.001); v = np.clip(bot - y * s, 0, H - 1.001)
    x0 = np.floor(u).astype(int); y0 = np.floor(v).astype(int); fx = (u - x0)[:, None]; fy = (v - y0)[:, None]
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy) +
            img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)
# cores de referência
def mean_px(x0, x1, y0, y1): return im[y0:y1, x0:x1].reshape(-1, 3).mean(0)
HAIR = mean_px(575, 650, 40, 75)
print('hair', HAIR)

# rasteriza triângulos no espaço UV
pos = np.zeros((T, T, 3)); nor = np.zeros((T, T, 3)); filled = np.zeros((T, T), bool)
uvp = UV * T - 0.5
for tri in I:
    q = uvp[tri]
    x0, y0 = np.floor(q.min(0)).astype(int); x1, y1 = np.ceil(q.max(0)).astype(int)
    x0 = max(x0, 0); y0 = max(y0, 0); x1 = min(x1, T - 1); y1 = min(y1, T - 1)
    if x1 < x0 or y1 < y0: continue
    gx, gy = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
    (ax, ay), (bx, by), (cx, cy) = q
    den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if abs(den) < 1e-12: continue
    w0 = ((by - cy) * (gx - cx) + (cx - bx) * (gy - cy)) / den
    w1 = ((cy - ay) * (gx - cx) + (ax - cx) * (gy - cy)) / den
    w2 = 1 - w0 - w1
    e = -0.02
    ins = (w0 >= e) & (w1 >= e) & (w2 >= e)
    if not ins.any(): continue
    W3 = np.stack([w0[ins], w1[ins], w2[ins]], 1)
    yy, xx = gy[ins], gx[ins]
    pos[yy, xx] = W3 @ P[tri]; nor[yy, xx] = W3 @ N[tri]; filled[yy, xx] = True
print('filled', filled.mean())

ys, xs = np.where(filled)
p = pos[ys, xs]; n = nor[ys, xs]; n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9
x, y, z = p[:, 0], p[:, 1], p[:, 2]
front = sample(x, y)
back = np.clip(-n[:, 2] * 2.5 - 0.15, 0, 1)[:, None]  # 0 = frente/lado, 1 = costas
# costas da cabeça: cabelo
head = np.clip((y - 1.49) / 0.03, 0, 1)[:, None]
# laterais da cabeça (fora do rosto, de frente a projeção estica): também cabelo
side = (np.clip((np.abs(x) - 0.068) / 0.012, 0, 1) * np.clip((y - 1.53) / 0.02, 0, 1) *
        np.clip((0.75 - n[:, 2]) / 0.25, 0, 1))[:, None]
hw = np.maximum(back * head, side)
hair_tex = HAIR * (0.85 + 0.3 * sample(np.clip(x, -0.05, 0.05) * 0.3, np.full_like(y, 1.66)) / 255)
col = front * (1 - hw) + hair_tex * hw
# costas do tronco: jaqueta (a frente mostra a camiseta aberta no meio)
torso = ((y > 0.88) & (y < 1.47)).astype(float)[:, None]
xj = np.sign(x + 1e-6) * (0.12 + np.abs(x) * 0.7)
jacket = sample(xj, y)
k = back * torso * np.clip((0.13 - np.abs(x)) / 0.04, 0, 1)[:, None]
col = col * (1 - k) + jacket * k
# variação leve (sujeira) para as costas não ficarem idênticas à frente
rng = np.random.default_rng(3)
noise = ndimage.gaussian_filter(rng.standard_normal((T // 8, T // 8)), 1.5)
noise = np.kron(noise, np.ones((8, 8)))[ys, xs][:, None]
col = col * (1 + noise * 0.25 * back)
tex = np.zeros((T, T, 3)); tex[ys, xs] = col
# preenche fora das ilhas UV com a cor mais próxima (evita costuras pretas)
_, (fy, fx) = ndimage.distance_transform_edt(~filled, return_indices=True)
tex = tex[fy, fx]
Image.fromarray(np.clip(tex, 0, 255).astype(np.uint8)).save(OUT, quality=90)
print('saved', OUT)
