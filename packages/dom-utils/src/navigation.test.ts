import {
    assignLocation,
    assignTopLocation,
    replaceLocation,
    replaceTopLocation,
    setTopLocationHref,
} from './navigation';

// jsdom does not allow spying on `window.location` or `window.top`, and it only
// implements navigation for hash changes. These tests use hash URLs and check the
// new URL and the history length. In jsdom, the test window is also the top window.
describe('navigation', () => {
    beforeEach(() => {
        window.history.replaceState({}, '', '/checkout');
    });

    it('assigns a new URL to the current window and adds a history entry', () => {
        const { length } = window.history;

        assignLocation('#assign');

        expect(window.location.hash).toBe('#assign');
        expect(window.history.length).toBe(length + 1);
    });

    it('replaces the URL of the current window without a new history entry', () => {
        const { length } = window.history;

        replaceLocation('#replace');

        expect(window.location.hash).toBe('#replace');
        expect(window.history.length).toBe(length);
    });

    it('assigns a new URL to the top window and adds a history entry', () => {
        const { length } = window.history;

        assignTopLocation('#assign-top');

        expect(window.location.hash).toBe('#assign-top');
        expect(window.history.length).toBe(length + 1);
    });

    it('replaces the URL of the top window without a new history entry', () => {
        const { length } = window.history;

        replaceTopLocation('#replace-top');

        expect(window.location.hash).toBe('#replace-top');
        expect(window.history.length).toBe(length);
    });

    it('sets the href of the top window', () => {
        setTopLocationHref('#href-top');

        expect(window.location.hash).toBe('#href-top');
    });
});
