#!/usr/bin/env bash
# 重算實登行情並重建祐承的社區地圖、地段地圖、購屋分析頁
set -euo pipefail
cd "$(dirname "$0")"
python3 lvr_calc.py
python3 update.py
python3 comm.py >/dev/null
python3 loc.py >/dev/null
python3 ana.py >/dev/null
python3 sitemap.py
echo "pages rebuilt"
