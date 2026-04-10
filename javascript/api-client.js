(function () {
    function trimString(value) {
        return typeof value === 'string' ? value.trim() : '';
    }

    function buildQueryString(query) {
        var searchParams = new URLSearchParams();

        Object.keys(query || {}).forEach(function (key) {
            var value = query[key];

            if (value === undefined || value === null || value === '') {
                return;
            }

            searchParams.set(key, String(value));
        });

        return searchParams.toString();
    }

    function buildUrl(baseUrl, path, query) {
        var normalizedBase = trimString(baseUrl || '').replace(/\/+$/, '');
        var normalizedPath = String(path || '').replace(/^\/+/, '');
        var queryString = buildQueryString(query);
        var finalUrl = normalizedBase
            ? normalizedBase + '/' + normalizedPath
            : '/' + normalizedPath;

        return queryString ? (finalUrl + '?' + queryString) : finalUrl;
    }

    function createApiError(message, extra) {
        var error = new Error(message || '请求失败');
        Object.assign(error, extra || {});
        return error;
    }

    function buildHeaders(context, extraHeaders, hasFormDataBody) {
        var headers = Object.assign({}, extraHeaders || {});
        var authToken = trimString((context || {}).authToken);
        var previewEmail = trimString((context || {}).previewUserEmail);
        var previewUsername = trimString((context || {}).previewUsername);

        headers.Accept = headers.Accept || 'application/json';

        if (!hasFormDataBody && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        if (authToken) {
            headers.Authorization = 'Bearer ' + authToken;
        } else if (previewEmail) {
            headers['X-Reid-Dev-User-Email'] = previewEmail;
            headers['X-Reid-Dev-Username'] = previewUsername || '本地预览用户';
        }

        return headers;
    }

    async function parseResponse(response) {
        var contentType = response.headers.get('content-type') || '';

        if (contentType.indexOf('application/json') !== -1) {
            return response.json();
        }

        return response.text();
    }

    async function request(options) {
        var context = options.context || {};
        var controller = new AbortController();
        var timeoutMs = Number(options.timeoutMs || 60000);
        var hasFormDataBody = typeof FormData !== 'undefined' && options.body instanceof FormData;
        var url = buildUrl(options.baseUrl, options.path, options.query);
        var timer = null;
        var response;
        var payload;

        if (timeoutMs > 0) {
            timer = setTimeout(function () {
                controller.abort();
            }, timeoutMs);
        }

        try {
            response = await fetch(url, {
                method: options.method || 'GET',
                headers: buildHeaders(context, options.headers, hasFormDataBody),
                body: options.body,
                signal: controller.signal
            });
            payload = await parseResponse(response);
        } catch (error) {
            if (timer) {
                clearTimeout(timer);
            }

            if (error && error.name === 'AbortError') {
                throw createApiError('请求超时，请稍后重试', {
                    code: 'TIMEOUT',
                    statusCode: 408
                });
            }

            throw createApiError('网络请求失败，请检查服务是否已启动', {
                code: 'NETWORK_ERROR',
                detail: error && error.message
            });
        }

        if (timer) {
            clearTimeout(timer);
        }

        if (!response.ok) {
            throw createApiError(
                (payload && (payload.msg || payload.message)) || ('请求失败，状态码 ' + response.status),
                {
                    statusCode: response.status,
                    detail: payload && payload.detail,
                    payload: payload
                }
            );
        }

        if (payload && typeof payload === 'object' && payload.success === false) {
            throw createApiError(payload.msg || payload.message || '请求失败', {
                statusCode: response.status,
                detail: payload.detail,
                payload: payload
            });
        }

        return payload;
    }

    window.API_CLIENT = {
        buildUrl: buildUrl,
        createApiError: createApiError,
        request: request
    };
}());
