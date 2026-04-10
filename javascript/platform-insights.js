(function () {
    var REGION_LAYOUTS = [
        { name: '南门入口', shortName: '南门入口', x: 10, y: 70, w: 18, h: 18 },
        { name: '南门游客集散区', shortName: '集散区', x: 24, y: 50, w: 22, h: 24 },
        { name: '游客服务中心外侧', shortName: '服务中心', x: 34, y: 62, w: 18, h: 16 },
        { name: '湖心步道', shortName: '湖心步道', x: 42, y: 32, w: 18, h: 18 },
        { name: '湖心步道入口', shortName: '步道入口', x: 48, y: 48, w: 16, h: 12 },
        { name: '缆车引导区', shortName: '引导区', x: 64, y: 58, w: 14, h: 12 },
        { name: '缆车排队区', shortName: '缆车排队区', x: 68, y: 46, w: 18, h: 18 },
        { name: '山顶观景台', shortName: '观景台', x: 72, y: 16, w: 18, h: 18 },
        { name: '观景步道出口', shortName: '观景出口', x: 62, y: 22, w: 14, h: 12 },
        { name: '北门通道', shortName: '北门通道', x: 82, y: 62, w: 12, h: 12 },
        { name: '北门停车场', shortName: '停车场', x: 80, y: 74, w: 16, h: 16 }
    ];

    function deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function findRegionLayout(name) {
        var text = String(name || '');
        var index;

        for (index = 0; index < REGION_LAYOUTS.length; index += 1) {
            if (REGION_LAYOUTS[index].name === text) {
                return REGION_LAYOUTS[index];
            }
        }

        if (text.indexOf('南门') !== -1) {
            return REGION_LAYOUTS[1];
        }

        if (text.indexOf('湖心') !== -1) {
            return REGION_LAYOUTS[3];
        }

        if (text.indexOf('缆车') !== -1) {
            return REGION_LAYOUTS[6];
        }

        if (text.indexOf('观景') !== -1 || text.indexOf('山顶') !== -1) {
            return REGION_LAYOUTS[7];
        }

        if (text.indexOf('北门') !== -1 || text.indexOf('停车场') !== -1) {
            return REGION_LAYOUTS[10];
        }

        return { name: text || '未知区域', shortName: text || '未知', x: 48, y: 50, w: 16, h: 12 };
    }

    function statusFromLevel(level) {
        if (level >= 80) {
            return {
                label: '高热预警',
                tone: 'danger'
            };
        }

        if (level >= 60) {
            return {
                label: '拥挤关注',
                tone: 'warning'
            };
        }

        if (level >= 35) {
            return {
                label: '平稳运行',
                tone: 'info'
            };
        }

        return {
            label: '低热区域',
            tone: 'neutral'
        };
    }

    function buildMonitoringHeatmap(zones) {
        var zoneList = Array.isArray(zones) ? zones : [];

        return zoneList.map(function (zone) {
            var layout = findRegionLayout(zone.name);
            var level = Number(zone.level || 0);
            var derived = statusFromLevel(level);

            return {
                name: zone.name,
                shortName: layout.shortName,
                x: layout.x,
                y: layout.y,
                w: layout.w,
                h: layout.h,
                level: level,
                visitors: Number(zone.visitors || Math.round(level * 3.8)),
                statusLabel: zone.statusLabel || derived.label,
                tone: zone.tone || derived.tone,
                detail: zone.detail || ('热度值 ' + level + '，建议持续观察该区域人流变化。')
            };
        });
    }

    function buildMonitoringTimeline(timeline, selectedIndex) {
        var list = Array.isArray(timeline) ? timeline : [];
        var maxVisitors = 1;
        var normalizedIndex = Number(selectedIndex || 0);
        var points;

        list.forEach(function (item) {
            maxVisitors = Math.max(maxVisitors, Number(item.visitors || 0));
        });

        points = list.map(function (item, index) {
            return {
                index: index,
                time: item.time,
                visitors: Number(item.visitors || 0),
                active: index === normalizedIndex,
                height: Math.max(20, Math.round((Number(item.visitors || 0) / maxVisitors) * 80)),
                loadLabel: Number(item.visitors || 0) >= maxVisitors * 0.85 ? '高峰' : '平稳'
            };
        });

        return {
            points: points,
            selected: points[normalizedIndex] || points[0] || null
        };
    }

    function buildStatisticsInsights(statistics, monitoring) {
        var zones = (statistics || {}).zones || [];
        var trend = (statistics || {}).trend || [];
        var capacity = (statistics || {}).capacity || {};
        var highestZone = null;
        var highestTrend = null;
        var volatileZone = null;

        zones.forEach(function (zone) {
            if (!highestZone || Number(zone.visitors || 0) > Number(highestZone.visitors || 0)) {
                highestZone = zone;
            }

            if (!volatileZone || Math.abs(Number(zone.capacity || 0) - Number(zone.visitors || 0)) < Math.abs(Number(volatileZone.capacity || 0) - Number(volatileZone.visitors || 0))) {
                volatileZone = zone;
            }
        });

        trend.forEach(function (item) {
            if (!highestTrend || Number(item.detections || 0) > Number(highestTrend.detections || 0)) {
                highestTrend = item;
            }
        });

        return [
            {
                title: '高峰区域',
                detail: highestZone ? (highestZone.name + ' 当前是人流最密集区域。') : '暂无高峰区域数据。'
            },
            {
                title: '高峰时段',
                detail: highestTrend ? (highestTrend.label + ' 为检测与重识别高峰时段。') : '暂无时段数据。'
            },
            {
                title: '承载压力',
                detail: capacity.warningCapacity
                    ? ('当前承载率约 ' + Math.round((Number(capacity.currentVisitors || 0) / Number(capacity.warningCapacity || 1)) * 100) + '%，接近预警阈值。')
                    : '暂无承载阈值数据。'
            },
            {
                title: '波动区域',
                detail: volatileZone ? (volatileZone.name + ' 的剩余承载空间较小，波动需要持续关注。') : '暂无区域波动数据。'
            }
        ];
    }

    function buildStatisticsRecommendations(statistics, monitoring) {
        var zones = (statistics || {}).zones || [];
        var topZone = null;
        var loadedZone = null;
        var alertCount = Number(((monitoring || {}).summary || {}).alertCount || 0);

        zones.forEach(function (zone) {
            var ratio = Number(zone.capacity || 1) ? (Number(zone.visitors || 0) / Number(zone.capacity || 1)) : 0;

            if (!topZone || Number(zone.visitors || 0) > Number(topZone.visitors || 0)) {
                topZone = zone;
            }

            if (!loadedZone || ratio > loadedZone.ratio) {
                loadedZone = {
                    name: zone.name,
                    ratio: ratio
                };
            }
        });

        return [
            {
                title: '分流建议',
                detail: '建议优先对 ' + ((topZone || {}).name || '重点区域') + ' 开展游客分流和广播提示，缓解局部拥堵。'
            },
            {
                title: '巡检建议',
                detail: '建议安排值守人员复核湖心步道与缆车排队区摄像头画面，避免盲区积压。'
            },
            {
                title: '告警处置',
                detail: alertCount > 0
                    ? ('当前仍有 ' + alertCount + ' 条待关注预警，建议优先核实高相似度命中结果。')
                    : '当前预警压力较低，可保持常规巡查频率。'
            },
            {
                title: '容量建议',
                detail: loadedZone
                    ? ('建议重点关注 ' + loadedZone.name + ' 的承载压力，必要时提前安排引导人员分流。')
                    : '暂无需要重点干预的容量风险区域。'
            }
        ];
    }

    function buildTrajectoryMap(trajectory) {
        var list = Array.isArray(trajectory) ? trajectory : [];
        var nodes = list.map(function (item, index) {
            var layout = findRegionLayout(item.location || item.cameraName);

            return {
                seq: item.seq || (index + 1),
                cameraName: item.cameraName || '',
                location: item.location || '',
                timestamp: item.timestamp || '',
                x: layout.x + layout.w / 2,
                y: layout.y + layout.h / 2,
                current: index === list.length - 1
            };
        });

        return {
            regions: deepClone(REGION_LAYOUTS),
            nodes: nodes,
            pathData: nodes.map(function (node, index) {
                return (index === 0 ? 'M ' : 'L ') + node.x + ' ' + node.y;
            }).join(' ')
        };
    }

    function buildParamsSummary(params, sourceLabel) {
        var safeParams = params || {};

        return [
            '目标源：' + (sourceLabel || '未选择'),
            '置信度 ' + Number(safeParams.confThreshold || 0).toFixed(2),
            'IOU/NMS ' + Number(safeParams.iouThreshold || 0).toFixed(2),
            '相似度阈值 ' + Number(safeParams.similarityThreshold || 0).toFixed(2),
            'Top-K ' + Number(safeParams.topK || 0)
        ];
    }

    function buildResultNarrative(result) {
        if (!result) {
            return '等待生成重识别结果。';
        }

        if (result.passedThreshold) {
            return '疑似同一游客，建议继续查看轨迹并结合现场画面复核。';
        }

        return '当前结果低于核心阈值，建议人工复核后再决定是否进一步处置。';
    }

    function buildHistoryTrajectory(record, mock) {
        var current = record || {};
        var catalog = (((mock || {}).reid || {}).resultCatalog) || [];
        var index;

        if (Array.isArray(current.trajectory) && current.trajectory.length > 0) {
            return deepClone(current.trajectory);
        }

        for (index = 0; index < catalog.length; index += 1) {
            if (catalog[index].matchImage === current.matchImage) {
                return deepClone(catalog[index].trajectory || []);
            }
        }

        return [
            {
                seq: 1,
                cameraName: current.camera || '南门广场-01',
                location: current.location || '景区入口',
                timestamp: current.time || ''
            }
        ];
    }

    window.PLATFORM_INSIGHTS = {
        buildHistoryTrajectory: buildHistoryTrajectory,
        buildMonitoringHeatmap: buildMonitoringHeatmap,
        buildMonitoringTimeline: buildMonitoringTimeline,
        buildParamsSummary: buildParamsSummary,
        buildResultNarrative: buildResultNarrative,
        buildStatisticsInsights: buildStatisticsInsights,
        buildStatisticsRecommendations: buildStatisticsRecommendations,
        buildTrajectoryMap: buildTrajectoryMap
    };
}());
