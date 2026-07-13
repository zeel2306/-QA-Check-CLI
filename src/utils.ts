import { execa } from "execa";

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
    console.log(error);

    return {
      success: false,
      stdout: "",
      stderr: String(error),
      exitCode: 1,
    };
  }
}
