import numpy as np, sys
from PIL import Image, ImageDraw
from scipy import ndimage
from glb import load, acc
j, b = load(sys.argv[1])
prim = j['meshes'][0]['primitives'][0]
P = acc(j, b, prim['attributes']['POSITION']); I = acc(j, b, prim['indices']).reshape(-1, 3)
print('mesh node', [n for n in j['nodes'] if 'mesh' in n])
im = np.asarray(Image.open(sys.argv[2]).convert('RGB')).astype(np.int32)
bg = np.median(np.concatenate([im[:20].reshape(-1,3), im[-20:].reshape(-1,3)]), axis=0)
mask = ndimage.uniform_filter(np.abs(im - bg).sum(2).astype(float), 3) > 8
mask = ndimage.binary_closing(ndimage.binary_opening(mask, iterations=1), iterations=3)
lab, n = ndimage.label(mask); sizes = ndimage.sum(mask, lab, range(1, n + 1)); mask = lab == (np.argmax(sizes) + 1)
mask = ndimage.binary_fill_holes(mask)
ys, xs = np.where(mask); print('bbox', xs.min(), xs.max(), ys.min(), ys.max(), 'bg', bg)
np.save('mask.npy', mask)
top, bot = ys.min(), ys.max()
def render(sx, ox):
    s = (bot - top) / 1.7
    u = (P[:, 0] * sx) * s + ox; v = bot - P[:, 1] * s
    img = Image.new('L', (im.shape[1], im.shape[0]), 0); d = ImageDraw.Draw(img)
    for t in I: d.polygon([(u[k], v[k]) for k in t], fill=255)
    return np.asarray(img) > 0
best = None
cx = (xs.min() + xs.max()) / 2
for sx in [-1, 1]:
  for ox in np.arange(cx - 20, cx + 21, 5):
    m = render(sx, ox); iou = (m & mask).sum() / (m | mask).sum()
    if not best or iou > best[0]: best = (iou, sx, ox, m)
print('best iou', best[:3])
over = np.zeros(im.shape, np.uint8); over[..., 0] = mask * 255; over[..., 1] = best[3] * 255
Image.fromarray(over).save('overlay.png')
open('calib.txt', 'w').write(f'{best[1]} {best[2]} {top} {bot}')
