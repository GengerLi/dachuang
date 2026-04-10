(function () {
    function deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function clampNumber(value, min, max, fallbackValue) {
        var parsed = Number(value);
        if (!Number.isFinite(parsed)) {
            return fallbackValue;
        }

        return Math.min(max, Math.max(min, parsed));
    }

    function clampInteger(value, min, max, fallbackValue) {
        var parsed = Number.parseInt(value, 10);
        if (!Number.isInteger(parsed)) {
            return fallbackValue;
        }

        return Math.min(max, Math.max(min, parsed));
    }

    function createTaskId(dateValue) {
        var date = dateValue instanceof Date ? dateValue : new Date(dateValue);
        var parts = [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0'),
            String(date.getHours()).padStart(2, '0'),
            String(date.getMinutes()).padStart(2, '0'),
            String(date.getSeconds()).padStart(2, '0')
        ];

        return 'TASK-' + parts.join('');
    }

    function getSourceOptions(mock) {
        var options = (((mock || {}).reid || {}).sourceOptions) || [];
        if (options.length > 0) {
            return deepClone(options);
        }

        return [
            { value: 'localVideo', label: '本地视频', description: '本地上传视频片段' },
            { value: 'cameraStream', label: '摄像头源', description: '实时摄像头回放源' },
            { value: 'historyLibrary', label: '历史库', description: '历史抓拍库' }
        ];
    }

    function getSourceOption(sourceOptions, sourceType) {
        var index;

        for (index = 0; index < sourceOptions.length; index += 1) {
            if (sourceOptions[index].value === sourceType) {
                return sourceOptions[index];
            }
        }

        return sourceOptions[0] || {
            value: 'localVideo',
            label: '本地视频',
            description: '本地上传视频片段'
        };
    }

    function buildDefaultParams(mock, settings) {
        var reidMock = (mock || {}).reid || {};
        var settingsDefaults = ((settings || {}).defaults) || {};
        var paramDefaults = reidMock.params || {};
        var autoSaveResult = (settings || {}).autoSave;

        return {
            confThreshold: clampNumber(
                settingsDefaults.confidence,
                0,
                1,
                clampNumber(paramDefaults.confThreshold, 0, 1, 0.72)
            ),
            iouThreshold: clampNumber(
                settingsDefaults.iou,
                0,
                1,
                clampNumber(paramDefaults.iouThreshold, 0, 1, 0.45)
            ),
            similarityThreshold: clampNumber(
                settingsDefaults.similarity,
                0,
                1,
                clampNumber(paramDefaults.similarityThreshold, 0, 1, 0.88)
            ),
            topK: clampInteger(
                settingsDefaults.topK,
                1,
                10,
                clampInteger(paramDefaults.topK, 1, 10, 5)
            ),
            autoSaveResult: typeof autoSaveResult === 'boolean'
                ? autoSaveResult
                : paramDefaults.autoSaveResult !== false,
            defaultSource: settingsDefaults.sourceType || paramDefaults.defaultSource || 'localVideo'
        };
    }

    function createInitialState(mock, settings) {
        var reidMock = (mock || {}).reid || {};
        var sourceOptions = getSourceOptions(mock);
        var defaultParams = buildDefaultParams(mock, settings);
        var selectedSource = getSourceOption(sourceOptions, defaultParams.defaultSource);

        return {
            sourceOptions: sourceOptions,
            selectedSourceType: selectedSource.value,
            defaultParams: defaultParams,
            params: {
                confThreshold: defaultParams.confThreshold,
                iouThreshold: defaultParams.iouThreshold,
                similarityThreshold: defaultParams.similarityThreshold,
                topK: defaultParams.topK,
                autoSaveResult: defaultParams.autoSaveResult
            },
            queryImage: {
                name: '',
                url: '',
                sizeBytes: 0,
                sizeText: '',
                width: 0,
                height: 0,
                uploadedAt: '',
                fileName: '',
                source: 'upload'
            },
            queryTask: {
                id: '',
                queryImage: '',
                sourceType: selectedSource.value,
                sourceName: selectedSource.label,
                status: 'idle',
                startedAt: '',
                elapsedMs: 0
            },
            progress: {
                progress: 0,
                detectedCandidates: 0,
                matchedCandidates: 0,
                finishedResults: 0
            },
            logs: deepClone(reidMock.initialLogs || []),
            results: [],
            selectedResultId: '',
            trajectory: [],
            currentFrame: deepClone(reidMock.idleFrame || {
                title: '当前处理帧',
                caption: '任务开始后展示关键抽帧',
                image: '',
                timestamp: '--:--'
            }),
            resultVideo: deepClone(reidMock.resultVideo || {
                title: '结果视频占位区',
                clipName: '等待生成结果片段',
                description: '完成任务后承接视频回放模块。',
                duration: '--:--'
            }),
            hints: deepClone(reidMock.hints || []),
            isProcessing: false
        };
    }

    function buildRunBundle(mock, options) {
        var reidMock = (mock || {}).reid || {};
        var sourceOptions = getSourceOptions(mock);
        var selectedSource = getSourceOption(sourceOptions, options.sourceType);
        var params = options.params || {};
        var topK = clampInteger(params.topK, 1, 10, 5);
        var similarityThreshold = clampNumber(params.similarityThreshold, 0, 1, 0.88);
        var autoSaveResult = !!params.autoSaveResult;
        var resultCatalog = deepClone(reidMock.resultCatalog || []).slice(0, topK);
        var processFrames = deepClone(reidMock.processFrames || []);
        var processSteps = deepClone(reidMock.processSteps || []);
        var startedAt = new Date();
        var taskId = createTaskId(startedAt);

        return {
            task: {
                id: taskId,
                queryImage: ((options.queryImage || {}).name) || '',
                sourceType: selectedSource.value,
                sourceName: selectedSource.label,
                status: 'processing',
                startedAt: startedAt.toISOString(),
                elapsedMs: 0
            },
            steps: processSteps.map(function (step) {
                var frame = processFrames[Number(step.frameIndex || 0)] || {};
                return {
                    delayMs: Number(step.delayMs || 560),
                    progress: clampInteger(step.progress, 0, 100, 0),
                    detectedCandidates: clampInteger(step.detectedCandidates, 0, 999, 0),
                    matchedCandidates: clampInteger(step.matchedCandidates, 0, 999, 0),
                    finishedResults: Math.min(topK, clampInteger(step.finishedResults, 0, topK, 0)),
                    level: step.level || 'info',
                    message: step.message || '正在处理任务...',
                    frame: frame
                };
            }),
            results: resultCatalog.map(function (item, index) {
                var similarity = clampNumber(item.similarity, 0, 100, 0);
                var passedThreshold = similarity / 100 >= similarityThreshold;

                return {
                    id: taskId + '-R' + String(index + 1),
                    rank: index + 1,
                    matchImage: item.matchImage || '',
                    similarity: similarity,
                    cameraName: item.cameraName || '',
                    location: item.location || '',
                    captureTime: item.captureTime || startedAt.toISOString(),
                    status: item.status || (passedThreshold ? 'verified' : 'review'),
                    saved: autoSaveResult,
                    note: item.note || '',
                    passedThreshold: passedThreshold,
                    paramsSummary: {
                        confThreshold: Number(params.confThreshold || 0),
                        iouThreshold: Number(params.iouThreshold || 0),
                        similarityThreshold: Number(params.similarityThreshold || 0),
                        topK: topK,
                        sourceName: selectedSource.label
                    },
                    narrative: passedThreshold
                        ? '疑似同一游客，建议继续查看轨迹并结合现场画面复核。'
                        : '当前结果低于核心阈值，建议人工复核后再决定是否进一步处置。',
                    trajectory: deepClone(item.trajectory || []),
                    resultClip: deepClone(item.resultClip || {}),
                    currentFrame: deepClone(item.currentFrame || {})
                };
            }),
            resultVideo: deepClone(
                ((resultCatalog[0] || {}).resultClip)
                || reidMock.resultVideo
                || {}
            ),
            trajectory: deepClone(
                ((resultCatalog[0] || {}).trajectory)
                || []
            ),
            finalFrame: deepClone(
                ((resultCatalog[0] || {}).currentFrame)
                || processFrames[processFrames.length - 1]
                || {}
            )
        };
    }

    function createHistoryRecord(options) {
        var result = options.result || {};
        var task = options.task || {};
        var queryImage = options.queryImage || {};
        var saved = !!result.saved;

        return {
            id: task.id || createTaskId(new Date()),
            queryImage: queryImage.fileName || queryImage.name || '',
            queryImageUrl: queryImage.url || '',
            matchImage: result.matchImage || '',
            similarity: clampNumber(result.similarity, 0, 100, 0),
            camera: result.cameraName || '',
            location: result.location || '',
            time: result.captureTime || new Date().toISOString(),
            status: saved ? 'verified' : 'review',
            saved: saved,
            operator: saved ? '预览模式自动写入' : '仅本次展示',
            note: result.note || (saved ? '重识别结果已自动保存到 mock 记录。' : '自动保存关闭，仅保留本次展示结果。'),
            paramsSummary: deepClone(result.paramsSummary || {}),
            narrative: result.narrative || '',
            trajectory: deepClone(result.trajectory || []),
            sourceType: task.sourceType || '',
            sourceName: task.sourceName || ''
        };
    }

    window.REID_WORKBENCH = {
        buildDefaultParams: buildDefaultParams,
        createHistoryRecord: createHistoryRecord,
        createInitialState: createInitialState,
        buildRunBundle: buildRunBundle
    };
}());
