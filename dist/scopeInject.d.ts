export default function scopeInject(): {
    name: string;
    configureServer(server: any): void;
    transform(code: string, id: string): {
        code: string;
        map: null;
    } | undefined;
};
export type optionType = {
    url: string;
    debug?: boolean;
};
