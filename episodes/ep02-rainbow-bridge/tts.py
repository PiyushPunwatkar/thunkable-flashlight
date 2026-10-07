import sys, soundfile as sf
from kokoro_onnx import Kokoro
S=sys.argv[1]
k=Kokoro(f"{S}/models/kokoro-v1.0.onnx", f"{S}/models/voices-v1.0.bin")
lines={
 "n1":("Socky and his new friend had found a sparkling stream... but how would they get across?",0.88),
 "n2":("Oh! Look at those butterflies! Can you count them?",0.88),
 "c1":("One!",0.8),"c2":("Two!",0.8),"c3":("Three!",0.8),"c4":("Four!",0.8),"c5":("Five!",0.8),
 "n3":("Socky needs your help! Can you find the yellow flower?",0.88),
 "n4":("Yes! The yellow one!",0.9),
 "n5":("Here comes a little riddle!",0.9),
 "n6":("I have wings, I can fly, and I love flowers. What am I?",0.85),
 "n7":("A butterfly! You got it!",0.92),
 "n8":("Wow! What's behind the tiny door? Let's find out next time!",0.88),
}
for key,(t,sp) in lines.items():
    a,sr=k.create(t,voice="af_heart",speed=sp,lang="en-us")
    sf.write(f"{S}/vo/{key}.wav",a,sr)
    print(key, round(len(a)/sr,2), sr)
