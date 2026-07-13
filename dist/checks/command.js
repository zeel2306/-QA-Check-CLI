export class CommandCheck {
    name;
    command;
    constructor(name, command) {
        this.name = name;
        this.command = command;
    }
    async run(projectPath) {
        const started = performance.now();
        const data = await this.command(projectPath);
        const unavailable = data.exitCode === -1;
        return { name: this.name, status: unavailable ? "SKIPPED" : data.success ? "PASS" : "FAIL", message: data.success ? "Passed" : data.stderr || data.stdout, duration: performance.now() - started, data };
    }
}
