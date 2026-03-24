"use client";

import { useRouter } from "next/navigation";
import { StandardPieChart } from "./StandardMetricsCharts";

interface DrillDownPieChartProps {
    data: any[];
    nameKey: string;
    dataKey: string;
    baseUrl: string;
    paramName: string;
    payloadKey?: string; // Field in the data object to use for the param value (fallback to nameKey)
}

export function DrillDownPieChart({ data, nameKey, dataKey, baseUrl, paramName, payloadKey }: DrillDownPieChartProps) {
    const router = useRouter();

    const handleClick = (payload: any) => {
        const val = payload?.[payloadKey || nameKey];
        if (val) {
            router.push(`${baseUrl}?${paramName}=${encodeURIComponent(String(val))}`);
        }
    };

    return (
        <StandardPieChart 
            data={data} 
            nameKey={nameKey} 
            dataKey={dataKey} 
            onClick={handleClick}
        />
    );
}
