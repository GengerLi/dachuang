(function () {
    var API_CLIENT = window.API_CLIENT || {};

    function trimString(value) {
        return typeof value === 'string' ? value.trim() : '';
    }

    function extractFilename(value) {
        var text = trimString(value);
        var parts;

        if (!text) {
            return '';
        }

        parts = text.split('/');
        return parts[parts.length - 1].split('?')[0];
    }

    function normalizeTrajectory(items) {
        if (!Array.isArray(items)) {
            return [];
        }

        return items.map(function (item, index) {
            return {
                seq: Number(item.seq || (index + 1)),
                cameraName: trimString(item.cameraName),
                location: trimString(item.location),
                timestamp: item.timestamp || item.captureTime || ''
            };
        });
    }

    function normalizeHistoryRecord(record) {
        var input = record || {};

        return {
            id: trimString(input.id),
            queryImage: trimString(input.queryImage || extractFilename(input.queryImageUrl)),
            queryImageUrl: trimString(input.queryImageUrl),
            matchImage: trimString(input.matchImage || extractFilename(input.matchImageUrl)),
            matchImageUrl: trimString(input.matchImageUrl),
            similarity: Number(input.similarity || 0),
            status: trimString(input.status) || 'review',
            saved: !!input.saved,
            camera: trimString(input.camera || input.cameraName),
            cameraName: trimString(input.cameraName || input.camera),
            location: trimString(input.location),
            time: input.time || input.captureTime || '',
            captureTime: input.captureTime || input.time || '',
            operator: trimString(input.operator),
            paramsSummary: input.paramsSummary && typeof input.paramsSummary === 'object'
                ? input.paramsSummary
                : {},
            trajectory: normalizeTrajectory(input.trajectory),
            note: trimString(input.note),
            sourceType: trimString(input.sourceType),
            sourceName: trimString(input.sourceName)
        };
    }

    function normalizeResultItem(item, index) {
        var input = item || {};

        return {
            id: trimString(input.id) || ('result-' + index),
            rank: Number(input.rank || (index + 1)),
            matchImage: trimString(input.matchImage || extractFilename(input.matchImageUrl)),
            matchImageUrl: trimString(input.matchImageUrl),
            similarity: Number(input.similarity || 0),
            cameraName: trimString(input.cameraName || input.camera),
            location: trimString(input.location),
            captureTime: input.captureTime || input.time || '',
            status: trimString(input.status) || 'review',
            saved: !!input.saved,
            note: trimString(input.note),
            passedThreshold: !!input.passedThreshold,
            paramsSummary: input.paramsSummary && typeof input.paramsSummary === 'object'
                ? input.paramsSummary
                : {},
            trajectory: normalizeTrajectory(input.trajectory),
            resultClip: input.resultClip && typeof input.resultClip === 'object'
                ? input.resultClip
                : {},
            currentFrame: input.currentFrame && typeof input.currentFrame === 'object'
                ? input.currentFrame
                : {}
        };
    }

    async function search(options) {
        var payload = options || {};
        var formData = new FormData();
        var response;

        formData.append('queryImage', payload.queryImageFile, payload.queryImageFile.name || 'query-image.jpg');
        formData.append('sourceType', trimString(payload.sourceType) || 'localVideo');
        formData.append('confThreshold', String(Number(payload.confThreshold || 0.72)));
        formData.append('iouThreshold', String(Number(payload.iouThreshold || 0.45)));
        formData.append('similarityThreshold', String(Number(payload.similarityThreshold || 0.88)));
        formData.append('topK', String(Number(payload.topK || 5)));
        formData.append('autoSaveResult', String(!!payload.autoSaveResult));

        response = await API_CLIENT.request({
            baseUrl: payload.baseUrl,
            path: '/api/reid/search',
            method: 'POST',
            body: formData,
            timeoutMs: payload.timeoutMs || 120000,
            context: payload.context || {}
        });

        return {
            success: !!response.success,
            taskId: trimString(response.taskId),
            message: trimString(response.message || response.msg),
            query: response.query && typeof response.query === 'object' ? response.query : {},
            results: Array.isArray(response.results)
                ? response.results.map(normalizeResultItem)
                : [],
            summary: response.summary && typeof response.summary === 'object'
                ? response.summary
                : {
                    detectedCandidates: 0,
                    matchedCandidates: 0,
                    finishedResults: 0
                },
            trajectory: normalizeTrajectory(response.trajectory),
            savedRecord: response.savedRecord ? normalizeHistoryRecord(response.savedRecord) : null,
            usage: response.usage && typeof response.usage === 'object' ? response.usage : null
        };
    }

    async function fetchHistoryList(options) {
        var payload = options || {};
        var response = await API_CLIENT.request({
            baseUrl: payload.baseUrl,
            path: '/api/reid/history',
            method: 'GET',
            query: {
                page: payload.page,
                pageSize: payload.pageSize,
                keyword: payload.keyword,
                status: payload.status,
                camera: payload.camera,
                location: payload.location
            },
            timeoutMs: payload.timeoutMs || 20000,
            context: payload.context || {}
        });

        return {
            success: !!response.success,
            records: Array.isArray(response.records)
                ? response.records.map(normalizeHistoryRecord)
                : [],
            pagination: response.pagination && typeof response.pagination === 'object'
                ? response.pagination
                : {
                    page: 1,
                    pageSize: 20,
                    total: 0
                }
        };
    }

    async function fetchHistoryDetail(options) {
        var payload = options || {};
        var response = await API_CLIENT.request({
            baseUrl: payload.baseUrl,
            path: '/api/reid/history/' + encodeURIComponent(trimString(payload.id)),
            method: 'GET',
            timeoutMs: payload.timeoutMs || 20000,
            context: payload.context || {}
        });

        return {
            success: !!response.success,
            record: normalizeHistoryRecord(response.record || {})
        };
    }

    window.REID_API = {
        fetchHistoryDetail: fetchHistoryDetail,
        fetchHistoryList: fetchHistoryList,
        normalizeHistoryRecord: normalizeHistoryRecord,
        normalizeResultItem: normalizeResultItem,
        search: search
    };
}());
