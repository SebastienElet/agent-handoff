import { z } from "zod";

export function nativeVariant(
  platform: string,
  architecture: string,
  report: () => unknown,
) {
  if (platform === "darwin" && architecture === "arm64") return "darwin-arm64";
  if (platform === "linux" && architecture === "x64") {
    const parsed = z
      .object({ header: z.object({ glibcVersionRuntime: z.string().min(1) }) })
      .safeParse(report());
    if (parsed.success) return "linux-x64-gnu";
    throw new Error(
      "Linux x64 requires an identified glibc runtime; musl and unknown libc are unsupported.",
    );
  }
  throw new Error(
    `Unsupported platform ${platform}/${architecture}. Supported: macOS ARM64 and Linux x64 glibc.`,
  );
}
