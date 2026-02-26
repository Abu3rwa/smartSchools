const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    underscore: "\x1b[4m",
    blink: "\x1b[5m",
    reverse: "\x1b[7m",
    hidden: "\x1b[8m",

    fg: {
        black: "\x1b[30m",
        red: "\x1b[31m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        blue: "\x1b[34m",
        magenta: "\x1b[35m",
        cyan: "\x1b[36m",
        white: "\x1b[37m",
        crimson: "\x1b[38m"
    }
};

const timestamp = () => {
    const now = new Date();
    const time = now.toTimeString().split(' ')[0];
    const date = now.toISOString().split('T')[0];
    return `${colors.dim}${date} ${time}${colors.reset}`;
};

const formatMeta = (meta) => {
    if (meta === undefined) return '';
    try {
        if (typeof meta === 'object') {
            return `\n${colors.dim}${JSON.stringify(meta, null, 2)}${colors.reset}`;
        }
        return ` ${colors.dim}(${meta})${colors.reset}`;
    } catch (e) {
        return ` [Meta Error: ${e.message}]`;
    }
};

const logger = {
    error(msg, meta) {
        console.error(
            `${timestamp()} ${colors.fg.red}${colors.bright}[ERROR]${colors.reset} ${colors.bright}${msg}${colors.reset}${formatMeta(meta)}`
        );
    },
    info(msg, meta) {
        console.log(
            `${timestamp()} ${colors.fg.cyan}${colors.bright}[INFO] ${colors.reset} ${msg}${formatMeta(meta)}`
        );
    },
    warn(msg, meta) {
        console.warn(
            `${timestamp()} ${colors.fg.yellow}${colors.bright}[WARN] ${colors.reset} ${colors.fg.yellow}${msg}${colors.reset}${formatMeta(meta)}`
        );
    },
    success(msg, meta) {
        console.log(
            `${timestamp()} ${colors.fg.green}${colors.bright}[DONE] ${colors.reset} ${colors.fg.green}${msg}${colors.reset}${formatMeta(meta)}`
        );
    }
};

export default logger;
