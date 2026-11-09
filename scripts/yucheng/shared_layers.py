import os
from paths import ROOT,DATA
import json
STATIONS=[("台鐵大慶站",24.11943,120.64877,"rail"),("台鐵五權站",24.12881,120.66669,"rail"),("台鐵臺中站",24.13707,120.68687,"rail"),("台鐵精武站",24.14933,120.6978,"rail"),("捷運大慶站",24.11906,120.6475,"mrt"),("捷運九張犁站",24.11438,120.63991,"mrt")]
def load():
    L=json.load(open(os.path.join(DATA,'loc_data.json'),encoding='utf-8'))
    ov={}
    p=ROOT+'/data/yucheng-coords.json'
    if os.path.exists(p):ov=json.load(open(p))
    return L,ov
