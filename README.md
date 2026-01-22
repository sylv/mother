# mother

mother is a vscode extension that lets you use open weights prediction models with vscode as inline completions.

currently only works with [Sweep AI's sweep-next-edit-1.5B](https://blog.sweep.dev/posts/oss-next-edit)

![a picture of tab completions](https://i.imgur.com/2BI1494.png)

the name ~~is stolen from~~ comes from [I Am Mother](https://en.wikipedia.org/wiki/I_Am_Mother)

## setup

> [!IMPORTANT]
> At some point I may improve this and possibly bundle running the model

I use ollama because its simple and can run in the background. You can use llama.cpp or whatever

- `ollama run hf.co/sweepai/sweep-next-edit-1.5B:latest`
- Ensure `mother.endpoint` matches your ollama url, ie `http://127.0.0.1:11434/v1`
- Ensure `mother.model` matches `hf.co/sweepai/sweep-next-edit-1.5B:latest` (or whatever you called it)
- It will probably work

## todo

- Context handling is basically "whatever codex came up with" and needs improvement
    - What/how many files should be included would be good to know
    - More information on the prompt in general would be nice
    - Testing whether the model could have things like stripped down signature-only files as context or whether it needs files verbatim might help us cut down context
- Speculative decoding
    - This would help a lot but probably require us running the model ourselves, ollama doesn't support speculative decoding and llama.cpp *might* but it might be more tedious for users unless we handle running the models ourselves.