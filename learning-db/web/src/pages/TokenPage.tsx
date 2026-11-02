import { useState, type FormEvent } from "react";
import { RiKey2Line, RiBookOpenLine } from "@remixicon/react";
import { Input } from "@/components/base/input/input";
import { Button } from "@/components/base/buttons/button";
import { api, setToken, type ApiError } from "@/lib/api";

export function TokenPage({ expired }: { expired?: boolean }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(expired ? "令牌无效或已更换，请重新输入。" : null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const token = value.trim();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api("/overview", token);
      setToken(token);
    } catch (err) {
      setError((err as ApiError).status === 401 ? "令牌不对，请检查后再试。" : `连接失败：${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background-full px-4">
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-5 rounded-3xl border border-border-button-default bg-background-primary-default p-6"
      >
        <div className="flex flex-col gap-2">
          <span className="flex size-10 items-center justify-center rounded-xl bg-background-secondary-default">
            <RiBookOpenLine className="size-5 text-foreground-icon-primary" aria-hidden />
          </span>
          <h1 className="text-title-3-semibold text-text-primary">学习知识库</h1>
          <p className="text-body-2-regular text-text-secondary">
            输入部署 Worker 时设置的 ACCESS_TOKEN。令牌只保存在这台设备的浏览器里。
          </p>
        </div>
        <Input
          label="访问令牌"
          type="password"
          autoComplete="current-password"
          leadingIcon={RiKey2Line}
          value={value}
          onChange={(v) => {
            setValue(v);
            setError(null);
          }}
          isInvalid={!!error}
          errorMessage={error ?? undefined}
          inputDir="ltr"
          autoFocus
        />
        <Button type="submit" disabled={busy || !value.trim()}>
          {busy ? "验证中…" : "进入"}
        </Button>
      </form>
    </div>
  );
}
