import * as ch from "chalk";

type LoggerColours = {
  warn: ch.ChalkInstance;
  error: ch.ChalkInstance;
  info: ch.ChalkInstance;
};

class Logger {
  readonly chalk;

  readonly color: LoggerColours;

  constructor(chalk: ch.ChalkInstance) {
    this.chalk = chalk;
    this.color = {
      warn: this.chalk.yellowBright,
      error: this.chalk.red,
      info: this.chalk.greenBright,
    };
  }

  log(...message: string[]) {
    if (message.length > 1) {
      const [title, ...rest] = message;
      console.log(`[${title}]:`, ...rest);
    } else {
      console.log(...message);
    }
  }

  throw({ type, cause }: { type: string; cause: string | string[] }) {
    throw `[${this.chalk.bgRgb(100, 0,0)(type)}]: ${this.color.error(cause)}`;
  }
}

export const logger = new Logger(
  new ch.Chalk()
);
