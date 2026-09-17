"""Crop and downscale assets/Icon.png into launcher and UI icon files."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "Icon.png"


def read_png(path: Path) -> tuple[int, int, bytearray]:
	data = path.read_bytes()
	assert data[:8] == b"\x89PNG\r\n\x1a\n"
	offset = 8
	width = height = 0
	idat = bytearray()
	while offset < len(data):
		length = struct.unpack(">I", data[offset : offset + 4])[0]
		kind = data[offset + 4 : offset + 8]
		chunk = data[offset + 8 : offset + 8 + length]
		if kind == b"IHDR":
			width, height, bit, color, _comp, _filt, inter = struct.unpack(
				">IIBBBBB",
				chunk,
			)
			if bit != 8 or color != 6 or inter != 0:
				raise SystemExit(f"unsupported PNG {path}")
		elif kind == b"IDAT":
			idat += chunk
		elif kind == b"IEND":
			break
		offset += 12 + length
	raw = zlib.decompress(bytes(idat))
	bpp = 4
	stride = width * bpp
	prev = bytearray(stride)
	out = bytearray()
	index = 0

	def paeth(a: int, b: int, c: int) -> int:
		p = a + b - c
		pa = abs(p - a)
		pb = abs(p - b)
		pc = abs(p - c)
		if pa <= pb and pa <= pc:
			return a
		if pb <= pc:
			return b
		return c

	for _ in range(height):
		filt = raw[index]
		index += 1
		row = bytearray(raw[index : index + stride])
		index += stride
		if filt == 1:
			for x in range(stride):
				left = row[x - bpp] if x >= bpp else 0
				row[x] = (row[x] + left) & 255
		elif filt == 2:
			for x in range(stride):
				row[x] = (row[x] + prev[x]) & 255
		elif filt == 3:
			for x in range(stride):
				left = row[x - bpp] if x >= bpp else 0
				row[x] = (row[x] + ((left + prev[x]) // 2)) & 255
		elif filt == 4:
			for x in range(stride):
				a = row[x - bpp] if x >= bpp else 0
				b = prev[x]
				c = prev[x - bpp] if x >= bpp else 0
				row[x] = (row[x] + paeth(a, b, c)) & 255
		elif filt != 0:
			raise SystemExit(f"unsupported filter {filt}")
		out += row
		prev = row
	return width, height, out


def content_bbox(width: int, height: int, pixels: bytearray) -> tuple[int, int, int, int]:
	min_x, min_y, max_x, max_y = width, height, -1, -1
	stride = width * 4
	for y in range(height):
		row = y * stride
		for x in range(width):
			o = row + x * 4
			r, g, b, a = pixels[o], pixels[o + 1], pixels[o + 2], pixels[o + 3]
			if a < 16:
				continue
			if r + g + b < 24:
				continue
			if x < min_x:
				min_x = x
			if y < min_y:
				min_y = y
			if x > max_x:
				max_x = x
			if y > max_y:
				max_y = y
	if max_x < 0:
		raise SystemExit("no opaque content")
	return min_x, min_y, max_x, max_y


def crop_square(
	width: int,
	height: int,
	pixels: bytearray,
	bbox: tuple[int, int, int, int],
	pad_ratio: float = 0.06,
) -> tuple[int, bytearray]:
	min_x, min_y, max_x, max_y = bbox
	cx = (min_x + max_x) / 2
	cy = (min_y + max_y) / 2
	side = int(max(max_x - min_x + 1, max_y - min_y + 1) * (1 + pad_ratio))
	side = min(side, width, height)
	left = int(round(cx - side / 2))
	top = int(round(cy - side / 2))
	left = max(0, min(left, width - side))
	top = max(0, min(top, height - side))
	out = bytearray(side * side * 4)
	src_stride = width * 4
	dst_stride = side * 4
	for y in range(side):
		src = ((top + y) * src_stride) + left * 4
		dst = y * dst_stride
		out[dst : dst + dst_stride] = pixels[src : src + dst_stride]
	return side, out


def resize(src_w: int, src_h: int, pixels: bytearray, dest: int) -> bytearray:
	if src_w == dest and src_h == dest:
		return bytearray(pixels)
	out = bytearray(dest * dest * 4)
	src_stride = src_w * 4
	for y in range(dest):
		y0 = y * src_h / dest
		y1 = (y + 1) * src_h / dest
		for x in range(dest):
			x0 = x * src_w / dest
			x1 = (x + 1) * src_w / dest
			acc = [0.0, 0.0, 0.0, 0.0]
			weight = 0.0
			ix0 = int(x0)
			ix1 = min(src_w, max(ix0 + 1, int(x1 + 0.999999)))
			iy0 = int(y0)
			iy1 = min(src_h, max(iy0 + 1, int(y1 + 0.999999)))
			for iy in range(iy0, iy1):
				ya = max(y0, iy)
				yb = min(y1, iy + 1)
				yh = yb - ya
				if yh <= 0:
					continue
				row = iy * src_stride
				for ix in range(ix0, ix1):
					xa = max(x0, ix)
					xb = min(x1, ix + 1)
					xw = xb - xa
					if xw <= 0:
						continue
					w = xw * yh
					o = row + ix * 4
					acc[0] += pixels[o] * w
					acc[1] += pixels[o + 1] * w
					acc[2] += pixels[o + 2] * w
					acc[3] += pixels[o + 3] * w
					weight += w
			o = (y * dest + x) * 4
			if weight <= 0:
				continue
			out[o] = min(255, int(acc[0] / weight + 0.5))
			out[o + 1] = min(255, int(acc[1] / weight + 0.5))
			out[o + 2] = min(255, int(acc[2] / weight + 0.5))
			out[o + 3] = min(255, int(acc[3] / weight + 0.5))
	return out


def chunk(kind: bytes, payload: bytes) -> bytes:
	crc = zlib.crc32(kind + payload) & 0xFFFFFFFF
	return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", crc)


def encode_png(width: int, height: int, pixels: bytes) -> bytes:
	raw = bytearray()
	stride = width * 4
	for y in range(height):
		raw.append(0)
		start = y * stride
		raw.extend(pixels[start : start + stride])
	compressed = zlib.compress(bytes(raw), 9)
	ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
	return (
		b"\x89PNG\r\n\x1a\n"
		+ chunk(b"IHDR", ihdr)
		+ chunk(b"IDAT", compressed)
		+ chunk(b"IEND", b"")
	)


def write_png(path: Path, width: int, pixels: bytearray) -> None:
	path.parent.mkdir(parents=True, exist_ok=True)
	path.write_bytes(encode_png(width, width, pixels))
	print(f"wrote {path} ({width}px, {path.stat().st_size} bytes)")


def write_ico(path: Path, frames: list[tuple[int, bytes]]) -> None:
	count = len(frames)
	offset = 6 + 16 * count
	entries = bytearray()
	payload = bytearray()
	for size, png in frames:
		entries += struct.pack(
			"<BBBBHHII",
			0 if size >= 256 else size,
			0 if size >= 256 else size,
			0,
			0,
			1,
			32,
			len(png),
			offset,
		)
		payload += png
		offset += len(png)
	path.parent.mkdir(parents=True, exist_ok=True)
	path.write_bytes(struct.pack("<HHH", 0, 1, count) + bytes(entries) + bytes(payload))
	print(f"wrote {path} ({path.stat().st_size} bytes)")


def main() -> None:
	width, height, pixels = read_png(SOURCE)
	bbox = content_bbox(width, height, pixels)
	side, cropped = crop_square(width, height, pixels, bbox)
	print(f"source {width}x{height} bbox {bbox} crop {side}")
	sizes = {
		16: resize(side, side, cropped, 16),
		32: resize(side, side, cropped, 32),
		48: resize(side, side, cropped, 48),
		180: resize(side, side, cropped, 180),
		256: resize(side, side, cropped, 256),
	}
	write_png(ROOT / "packages" / "launcher" / "ui" / "icon.png", 256, sizes[256])
	write_png(ROOT / "packages" / "ui" / "src" / "favicon-32x32.png", 32, sizes[32])
	write_png(
		ROOT / "packages" / "ui" / "src" / "apple-touch-icon.png",
		180,
		sizes[180],
	)
	ico_frames = [
		(size, encode_png(size, size, sizes[size]))
		for size in (16, 32, 48, 256)
	]
	write_ico(ROOT / "packages" / "launcher" / "ui" / "icon.ico", ico_frames)
	write_ico(
		ROOT / "packages" / "ui" / "src" / "favicon.ico",
		ico_frames[:3],
	)


if __name__ == "__main__":
	main()
