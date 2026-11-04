import { isTopWindow } from './isTopWindow';

describe('isTopWindow', () => {
    // jsdom does not allow redefining `window.top`, so only the top window case
    // can run here. Callers mock `isTopWindow` to test the iframe case.
    it('returns true when the window is the top window', () => {
        expect(isTopWindow()).toBe(true);
    });
});
