import { React } from "@webpack/common";

const listeners = new Set<() => void>();
let _isSummarizing = false;

export const SummaryState = {
    get isSummarizing() { return _isSummarizing; },
    set isSummarizing(v: boolean) {
        if (_isSummarizing !== v) {
            _isSummarizing = v;
            listeners.forEach(l => l());
        }
    }
};

export function useIsSummarizing() {
    const [val, setVal] = React.useState(SummaryState.isSummarizing);
    React.useEffect(() => {
        const handler = () => setVal(SummaryState.isSummarizing);
        listeners.add(handler);
        return () => { listeners.delete(handler); };
    }, []);
    return val;
}
