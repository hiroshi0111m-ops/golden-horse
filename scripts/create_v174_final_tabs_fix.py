from pathlib import Path
import hashlib
import subprocess
import sys


root = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, str(root / "scripts/create_v173_mobile_nav_fix.py")], check=True)

source = root / "checkpoints/V173_MOBILE_NAV_SAFE_AREA/index.html"
raw = source.read_bytes()
assert hashlib.sha256(raw).hexdigest() == "84d505571c0b34962e234cb04b4ca187516a0368adf40f6903eafd80ac0ea85d", "V173 candidate changed"
html = raw.decode()

nav_old = '<nav class="gh-v60-nav" aria-label="ゲーム内の主な画面"><button class="gh-v60-nav-item" data-page="home"><span>⌂</span>ホーム</button><button class="gh-v60-nav-item" data-page="startPage"><span>♞</span>レース</button><button class="gh-v60-nav-item" data-page="horse"><span>♘</span>育成</button><button class="gh-v60-nav-item" data-page="cards"><span>◇</span>カード</button><button class="gh-v60-nav-item" data-page="gacha"><span>✧</span>ガチャ</button></nav>'
nav_new = '<nav class="gh-v60-nav" aria-label="ゲーム内の主な画面"><button class="gh-v60-nav-item" data-page="home"><span>⌂</span>ホーム</button><button class="gh-v60-nav-item" data-page="startPage"><span>♞</span>レース</button><button class="gh-v60-nav-item" data-page="horse"><span>♘</span>育成</button><button class="gh-v60-nav-item" data-page="campaign"><span>✦</span>特典</button><button class="gh-v60-nav-item" data-page="login"><span>♙</span>マイページ</button></nav>'
assert html.count(nav_old) == 1, "V173 final navigation markup not found"
html = html.replace(nav_old, nav_new, 1)

show_old = 'body:has(#home.active,#cards.active,#horse.active,#jockey.active,#gacha.active) .gh-v60-nav{display:grid}'
show_new = 'body:has(#home.active,#startPage.active,#horse.active,#campaign.active,#login.active) .gh-v60-nav{display:grid}'
assert html.count(show_old) == 1, "V173 navigation visibility selector not found"
html = html.replace(show_old, show_new, 1)

active_old = 'body:has(#home.active) .gh-v60-nav-item[data-page="home"],body:has(#startPage.active) .gh-v60-nav-item[data-page="startPage"],body:has(#horse.active) .gh-v60-nav-item[data-page="horse"],body:has(#cards.active) .gh-v60-nav-item[data-page="cards"],body:has(#gacha.active) .gh-v60-nav-item[data-page="gacha"]{border-color:#d5ae62;background:linear-gradient(180deg,#725022,#3c260f);color:#fff6d5}'
active_new = 'body:has(#home.active) .gh-v60-nav-item[data-page="home"],body:has(#startPage.active) .gh-v60-nav-item[data-page="startPage"],body:has(#horse.active) .gh-v60-nav-item[data-page="horse"],body:has(#campaign.active) .gh-v60-nav-item[data-page="campaign"],body:has(#login.active) .gh-v60-nav-item[data-page="login"]{border-color:#d5ae62;background:linear-gradient(180deg,#725022,#3c260f);color:#fff6d5}'
assert html.count(active_old) == 1, "V173 navigation active selector not found"
html = html.replace(active_old, active_new, 1)

friend_hide_old = '#startPage .twoCol,#login,.gh-v65-anti-access{display:none!important}'
friend_hide_new = '#startPage .twoCol,.gh-v65-anti-access{display:none!important}'
assert html.count(friend_hide_old) == 1, "V173 friend-mode login hide rule not found"
html = html.replace(friend_hide_old, friend_hide_new, 1)

assert html.count("V173-MOBILE-NAV-SAFE-AREA") == 1, "V173 build marker not found"
html = html.replace("V173-MOBILE-NAV-SAFE-AREA", "V174-FINAL-FIVE-TABS", 1)

output = root / "checkpoints/V174_FINAL_FIVE_TABS/index.html"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(html)
print("V174_OUTPUT=" + str(output.relative_to(root)))
print("V174_SHA256=" + hashlib.sha256(output.read_bytes()).hexdigest())
