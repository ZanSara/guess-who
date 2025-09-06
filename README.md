# 🕵️ Play "Guess Who" with an LLM! 

_and watch it fail 🫠_

---

LLMs nowadays are headed for superintelligence, they say. They should make good tabletop game partners then, I guess?

In this repo you can find a simple implementation of a Guess Who game. If you're not familiar with the rules, here they are: each player receives a character and has to guess the opponent's character name by asking yes/no questions in turns. For example: "Is your character blonde?" or "Does your character have glasses?". Whoever guesses first wins. A very simple game that should be within the understanding of any multimodal language model.

[Try for yourself](https://zansara.dev/guess-who/) to find out.

## How to play?

The game consists of a chat between you and the LLM, plus a board for each of you to keep track of which characters doesn't match the opponent's description anymore. Both you and the LLM can cross off characters from the board: you by clicking on the card, the LLM by invoking the `eliminateCharacter` tool. The LLM is also in charge of declaring a winner by calling the `endGame` tool.

![](/help/chat.png)

_The chat interface_

![](/help/user-board.png)

_Your board_

![](/help/llm-board.png)

_The LLM's board_

You can find the game at https://zansara.dev/guess-who/. You will be asked to add your own API key or the address of your local LLM endpoint in order to play the game.

![](/help/settings.png)

_The settings window_

If you don't trust me with your API keys (legit!) the game is entirely open-source and can be copied, forked, cloned, whatever you prefer, and run locally. You only need a small http server to serve it and you're all set.

For example, you could do the following:

```
git clone https://github.com/ZanSara/guess-who.git
cd guess-who/
python3 -m http.server -b 127.0.0.1 8000
```

then open your browser at http://localhost:8000.

## What's the catch?

Try once as if you were playing with a human: if you picked a reasonably smart LLM, you may not notice any problem at first. 

You will also win. 100% guaranteed.

If you pay close attention, the LLM _is not playing_. It's not keeping tabs of which characters fit the description of the questions it asks. It will keep asking random questions until you finally close on the right character and win.

Try to make the LLM win, at all costs. Do your best. Tell them all the details of your character until it should be trivial for them to win.

Keep trying.

If you manage to make the LLM win a game without cheating, please share - I haven't managed yet.

### and if you picked a less smart LLM...

... there's gonna be no game at all.

![](/help/llm-spoiling-character.png)

## Can I have even more fun?

In the settings there are a few options for the advanced player:

1. You can reveal the LLM's character. In this way you can check if the LLM is lying to your about its character (a shockingly frequent occurrence with smaller models)

2. You can also rewrite the system prompt. I provide two versions, the "simple" one (what I would need to tell a human to make them able to play the game) and the "spelled out" version (that makes a few very large LLM actually try to play)

You can also write your own to see what does it take to make your LLM of choice finally be a decent Guess Who partner (good luck).

## Hall of Fame

Coming soon!

## Why is this so hard??

LLMs are specifically trained to _assist you_. Playing a tabletop game implies a little adversarial thinking that LLMs are usually trained against, and shows very well when they're not specifically and strongly instructed to do otherwise. 

Larger LLM can overcome some of that training with prompting alone. Smaller models need some fine-tuning to get out of that attitude.

## How is this game made?

Most of the game is implemented in a single HTML file (`index.html`), plus a style CSS (`style.css`), an small implementation of each LLM provider supported (`openai.js`, `anthropic.js`, `gemini.js`), and the character's images (`full-board.png` and `guess-who-people/`). It also has a couple of system prompts stored as text files (`prompts/`).

The entire codebase is quite small and within the reach of what Claude Code can build almost unassisted (ahem).

Contributions of all kinds are welcome 🙇
