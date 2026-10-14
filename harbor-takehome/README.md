# Harbor Surrogacy: lead insights take-home

## The situation

Harbor Surrogacy is a small agency that recruits surrogates. Leads come in from Facebook, Instagram, TikTok, Google, referrals and word of mouth. Each lead fills out a short screener, and a coordinator follows up by text and phone. If things go well, the lead fills out an application, books a consult, sends medical records and is accepted.

Erin owns Harbor and has asked for a call.

Lakeside Family Building is a second, much larger agency. It sends the same kind of exports. Anything you build should work for both agencies, and the two must never see each other's data.

The agencies also define success differently. Harbor counts a lead as a qualified surrogate once she attends a consult. Lakeside counts her once she reaches the records stage.

Harbor is on Pacific time and Lakeside is on Central time.

## What you get

- `exports/harbor/` and `exports/lakeside/`: CSV exports pulled from each agency's tools on October 1, 2026. See `exports/README.md` for what's in each file.
- `docker-compose.yml`: a Postgres 16 database you can use if you want one.

That's all. There's no starter app and no schema. You decide how to model the data.

## What we'd like

1. **A call with Erin, 30–45 minutes.** Find out what she needs.
2. **A small working product that answers her questions.** It doesn't need to be pretty, but Erin has to be able to open it and use it herself. A plain web page is fine; a command-line tool is not.
3. **A short write-up, one page at most**, covering:
   - what you heard from Erin and what you decided to build
   - your data model and why
   - what you'd tell Erin today, in plain English
   - what you chose not to build, and why
   - what would need to change to support 50 agencies
   - roughly how many hours you spent

## Ground rules

- **Time:** a few hours. Use AI tools as much as you like; we expect you to. If you run out of time, stop and tell us what's left.
- **Language:** whatever you're productive in. We use TypeScript and Postgres, but that's not required.
- **Re-runs:** we'll give you a newer export during the follow-up session. Like this one, it will be a full snapshot of each agency's data, not just the changes. Loading it should just work.
- **Sensitive data:** screener answers include health information. Treat it as you would real patient data, and don't commit the exports to your repo.
- **Your work:** all the data is fictional. We won't use your code. You keep it, and you can make the repo public if you want.

## Submitting

Push to a private GitHub repo and share it with us. Commit as you go; we'd rather see how you got there than one big commit.

## The follow-up session, about 75 minutes

- Erin uses your product herself and asks questions.
- We load a newer export together.
- We walk through your code, and we may ask for a small change on the spot.

## How we'll evaluate

| Area | Weight | What we look for |
|---|---|---|
| Engineering | 35% | Correct numbers, a sound data model, reloads that don't double count, agencies kept apart, tests where they matter |
| Discovery and product judgment | 25% | You understood what Erin needed and built the right small thing |
| Data modeling and analysis | 25% | Careful with messy data, honest about what the data can and can't say |
| Communication | 15% | Erin can act on what you tell her; the write-up is clear and short |
