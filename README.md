# mother

> [!IMPORTANT]
> Very buggy and broken but does seem somewhat functional.
> Context management is probably slightly nuking model performance

mother provides next edit prediction in vscode using [Sweep AI's sweep-next-edit-1.5B](https://blog.sweep.dev/posts/oss-next-edit)

![a picture of the next edit predictions being used in vscode](https://i.imgur.com/2BI1494.png)

the name ~~is stolen from~~ comes from [I Am Mother](https://en.wikipedia.org/wiki/I_Am_Mother)

## setup

I use ollama because its simple and can run in the background. You can use llama.cpp or whatever

- `ollama pull hf.co/sweepai/sweep-next-edit-1.5B:latest`
- Check your settings
    - Ensure `mother.endpoint` matches your ollama url, ie `http://127.0.0.1:11434/v1`
    - Ensure `mother.model` matches `hf.co/sweepai/sweep-next-edit-1.5B:latest` (or whatever you called it)
- Profit

## todo

- Publish to vscode marketplace
- Option to limit completions to a single line
- Context handling is basically "whatever codex came up with" and needs improvement
    - What/how many files should be included would be good to know
    - More information on the prompt in general would be nice
    - Testing whether the model could have things like stripped down signature-only files as context or whether it needs files verbatim might help us cut down context
- Speculative decoding
    - This would help a lot but probably require us running the model ourselves, ollama doesn't support speculative decoding and llama.cpp *might* but it might be more tedious for users unless we handle running the models ourselves.