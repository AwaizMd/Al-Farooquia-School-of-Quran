// jsdom lacks a few browser APIs the app (and its chart/animation libraries) use.
window.matchMedia = window.matchMedia || ((query) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} }
window.IntersectionObserver = window.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} takeRecords() { return [] } }
window.scrollTo = () => {}
Element.prototype.scrollIntoView = () => {}
