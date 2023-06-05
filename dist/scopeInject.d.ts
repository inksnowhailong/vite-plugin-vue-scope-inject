export default function scopeInject(): {
    name: string;
    transform(code: any, id: any): {
        code: any;
        map: null;
    } | undefined;
};
