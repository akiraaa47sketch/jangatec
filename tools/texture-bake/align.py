import numpy as np
from PIL import Image, ImageDraw
from glb import load, acc
P = np.fromfile('fbx_pos.bin', np.float32).reshape(-1, 3).astype(np.float64)
Nn = np.fromfile('fbx_nor.bin', np.float32).reshape(-1, 3).astype(np.float64)
I = np.fromfile('fbx_idx.bin', np.uint32).reshape(-1, 3)
rot = lambda v: np.stack([-v[:, 2], v[:, 1], v[:, 0]], 1)  # +X -> +Z
P = rot(P); Nn = rot(Nn)
j, b = load('/root/.claude/uploads/c33348d1-5885-5937-ab84-9b4a95dbb88e/c9fb6dea-Meshy_AI_modelo1M_20261121_animated_mixamo_All_animation.glb')
pr = j['meshes'][0]['primitives'][0]
Q = acc(j, b, pr['attributes']['POSITION']).astype(np.float64); QI = acc(j, b, pr['indices']).reshape(-1, 3)
s = (Q[:, 1].max() - Q[:, 1].min()) / (P[:, 1].max() - P[:, 1].min())
P = (P - [0, P[:, 1].min(), 0]) * s
P[:, 0] += (Q[:, 0].max() + Q[:, 0].min()) / 2 - (P[:, 0].max() + P[:, 0].min()) / 2
P[:, 2] += np.median(Q[:, 2]) - np.median(P[:, 2])
print('scale', s, 'bbox fbx', P.min(0), P.max(0), 'meshy', Q.min(0), Q.max(0))
def sil(V, T, ax):
    img = Image.new('L', (600, 600), 0); d = ImageDraw.Draw(img)
    u = 300 + V[:, ax] * 320; v = 580 - V[:, 1] * 320
    for t in T: d.polygon([(u[k], v[k]) for k in t], fill=255)
    return np.asarray(img) > 0
for ax, name in [(0, 'front'), (2, 'side')]:
    a = sil(P, I[::1], ax); c = sil(Q, QI, ax)
    print(name, 'IoU', (a & c).sum() / (a | c).sum())
    o = np.zeros((600, 600, 3), np.uint8); o[..., 0] = a * 255; o[..., 1] = c * 255
    Image.fromarray(o).save(f'align_{name}.png')
np.save('fbx_P.npy', P); np.save('fbx_N.npy', Nn)
