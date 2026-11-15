// Verdict schema shared by the on-device model, the cloud model and the hosted bridge.
export const CATEGORIES = ['safe', 'adult', 'gambling', 'violence', 'drugs', 'weapons', 'hate', 'scam', 'phishing', 'malware', 'other'];

export const verdictSchema = {
    type: 'object',
    properties: {
        verdict: { type: 'string', enum: ['allow', 'warn', 'block'] },
        category: { type: 'string', enum: CATEGORIES },
        confidence: { type: 'number' },
        reason: { type: 'string' }
    },
    required: ['verdict', 'category', 'confidence', 'reason']
};
