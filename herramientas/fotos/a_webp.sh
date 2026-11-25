#!/bin/bash
# Convierte los renders (PNG 900×900 con transparencia) a WebP de 450 px para las maquetas.
# Uso: bash herramientas/fotos/a_webp.sh   (necesita ffmpeg con libwebp)
cd "$(dirname "$0")"
mkdir -p ../../maquetas/img
for f in renders/*.png; do
  n=$(basename "$f" .png)
  ffmpeg -loglevel error -y -i "$f" -vf "scale=450:450:flags=lanczos" -c:v libwebp -quality 82 -alpha_quality 90 "../../maquetas/img/$n.webp"
  echo "maquetas/img/$n.webp"
done
