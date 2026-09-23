import { execa } from "execa";

function isMissingCommand(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown; stderr?: unknown };
  const message = `${String(record.message ?? "")}\n${String(record.stderr ?? "")}`;

  return (
    record.code === "ENOENT" ||
    /not recognized as an internal or external command/i.test(message) ||
    /command not found/i.test(message)
  );
}

export async function runCommand(
  command: string,
  args: string[],
  cwd: string = process.cwd()
) {
  try {
    const result = await execa(command, args, {
      cwd,
      reject: false,
      // npm.cmd/npx.cmd are directly executable on Windows. Running them through
      // another shell changes the process tree and is unnecessary.
      shell: false,
    });

    console.log("========== DEBUG ==========");
    console.log("Command:", command, args.join(" "));
    console.log("CWD:", cwd);
    console.log("Exit Code:", result.exitCode);
    console.log("STDOUT:\n", result.stdout);
    console.log("STDERR:\n", result.stderr);
    console.log("===========================");

    return {
      success: result.exitCode === 0,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (isMissingCommand(error)) {
      return {
        success: false,
        stdout: "",
        stderr: message,
        exitCode: -1,
      };
    }

    console.log(error);

    return {
      success: false,
      stdout: "",
      stderr: message,
      exitCode: 1,
    };
  }
}
