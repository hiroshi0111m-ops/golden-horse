from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/"checkpoints"/"V168_BOOT_LOOP_FIX"/"index.html"
s=SRC.read_text(encoding="utf-8",errors="replace")

terms=["betBtn","betSlips","horsePick","addBet","placeBet","submitBet","bets.push","myBets","betSlips.push"]
for term in terms:
    print(f"=== TERM {term} ===")
    start=0
    n=0
    while n<20:
        i=s.find(term,start)
        if i<0:break
        line=s.count("\n",0,i)+1
        snippet=re.sub(r"\s+"," ",s[max(0,i-700):min(len(s),i+1400)]).strip()
        print(f"MATCH term={term} n={n+1} line={line} offset={i} snippet={snippet}")
        start=i+len(term)
        n+=1
print("BET_SOURCE_REPORT=PASS")
