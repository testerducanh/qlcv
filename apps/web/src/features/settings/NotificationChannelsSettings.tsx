import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { Card, CardTitle } from "../../components/Card";

type Channel = "email" | "zalo" | "sms";
type Preferences = {
  disabledTypes: string[];
  digestEnabled: boolean;
  channels: Record<string, Channel[]>;
  phoneNumber: string | null;
  zaloUserId: string | null;
  timeZone: string;
  quietStart: string | null;
  quietEnd: string | null;
};
type Delivery = {
  id: string;
  channel: Channel;
  status: "pending" | "processing" | "sent" | "failed";
  attempts: number;
  sentAt: string | null;
  lastError: string | null;
  createdAt: string;
  notification: { type: string };
};

const eventOptions = [
  { type: "task.assigned", label: "Được giao việc" },
  { type: "task.status_changed", label: "Trạng thái việc thay đổi" },
  { type: "task_due_soon", label: "Việc sắp đến hạn" },
  { type: "task_overdue", label: "Việc quá hạn" },
  { type: "task_escalated_assignee", label: "Việc được leo thang" },
  { type: "task_escalated_assigner", label: "Việc được báo cho người giao" },
  { type: "task_escalated_department", label: "Việc được báo trưởng phòng" },
  { type: "task_escalated_director", label: "Việc khẩn được báo giám đốc" },
  { type: "daily_digest", label: "Tóm tắt hằng ngày" },
  { type: "weekly_digest", label: "Tóm tắt hằng tuần" },
] as const;
const channels: { id: Channel; label: string }[] = [
  { id: "email", label: "Email" },
  { id: "zalo", label: "Zalo (mô phỏng)" },
  { id: "sms", label: "SMS (mô phỏng)" },
];

const defaultPreferences: Preferences = {
  disabledTypes: [],
  digestEnabled: false,
  channels: {},
  phoneNumber: null,
  zaloUserId: null,
  timeZone: "Asia/Bangkok",
  quietStart: null,
  quietEnd: null,
};

export function NotificationChannelsSettings() {
  const { apiFetch } = useAuth();
  const [preferences, setPreferences] =
    useState<Preferences>(defaultPreferences);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      apiFetch<Preferences>("/me/notification-preferences"),
      apiFetch<{ items: Delivery[] }>(
        "/me/notification-deliveries?pageSize=20",
      ),
    ])
      .then(([nextPreferences, recentDeliveries]) => {
        if (!active) return;
        setPreferences({ ...defaultPreferences, ...nextPreferences });
        setDeliveries(recentDeliveries.items);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "Không tải được cài đặt",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [apiFetch]);

  const chooseChannel = (
    eventType: string,
    channel: Channel,
    checked: boolean,
  ) => {
    setPreferences((current) => {
      const selected = new Set(current.channels[eventType] ?? []);
      if (checked) selected.add(channel);
      else selected.delete(channel);
      const nextChannels = { ...current.channels };
      if (selected.size) nextChannels[eventType] = [...selected];
      else delete nextChannels[eventType];
      return { ...current, channels: nextChannels };
    });
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await apiFetch<Preferences>(
        "/me/notification-preferences",
        {
          method: "PATCH",
          body: JSON.stringify({
            channels: preferences.channels,
            digestEnabled: preferences.digestEnabled,
            phoneNumber: preferences.phoneNumber || null,
            zaloUserId: preferences.zaloUserId || null,
            quietStart: preferences.quietStart || null,
            quietEnd: preferences.quietEnd || null,
          }),
        },
      );
      setPreferences((current) => ({ ...current, ...updated }));
      setSaved(true);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Không lưu được cài đặt",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-16">
      <Card className="p-16 sm:p-24">
        <CardTitle as="h2">Thông báo ngoài ứng dụng</CardTitle>
        <p className="mt-8 text-sm text-text-secondary">
          Email dùng địa chỉ tài khoản. Zalo và SMS hiện chỉ mô phỏng; chưa gửi
          tin qua nhà cung cấp thật.
        </p>
        {loading ? <p role="status">Đang tải cài đặt…</p> : null}
        <form className="mt-16" onSubmit={save}>
          <fieldset
            disabled={loading || saving}
            className="space-y-16 border-0 p-0"
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">
                  Chọn kênh thông báo cho từng sự kiện
                </caption>
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="border-b border-border-default p-8"
                    >
                      Sự kiện
                    </th>
                    {channels.map((channel) => (
                      <th
                        key={channel.id}
                        scope="col"
                        className="border-b border-border-default p-8"
                      >
                        {channel.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {eventOptions.map((option) => (
                    <tr key={option.type}>
                      <th
                        scope="row"
                        className="border-b border-border-default p-8 font-normal"
                      >
                        {option.label}
                      </th>
                      {channels.map((channel) => (
                        <td
                          key={channel.id}
                          className="border-b border-border-default p-8"
                        >
                          <input
                            type="checkbox"
                            aria-label={`${option.label}: ${channel.label}`}
                            checked={
                              preferences.channels[option.type]?.includes(
                                channel.id,
                              ) ?? false
                            }
                            onChange={(event) =>
                              chooseChannel(
                                option.type,
                                channel.id,
                                event.currentTarget.checked,
                              )
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="grid max-w-md gap-4 text-sm">
              Số điện thoại (định dạng quốc tế)
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                pattern="^\+[1-9][0-9]{7,14}$"
                placeholder="+84901234567"
                value={preferences.phoneNumber ?? ""}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    phoneNumber: event.currentTarget.value,
                  }))
                }
                className="min-h-touch rounded-md border border-border-default bg-surface-raised px-8"
              />
            </label>
            <label className="flex items-start gap-8 text-sm">
              <input
                type="checkbox"
                checked={preferences.digestEnabled}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    digestEnabled: event.currentTarget.checked,
                  }))
                }
              />
              <span>Gom thông báo trong ứng dụng thành tóm tắt hằng ngày</span>
            </label>
            <label className="grid max-w-md gap-4 text-sm">
              Mã người nhận Zalo OA
              <input
                type="text"
                autoComplete="off"
                maxLength={128}
                value={preferences.zaloUserId ?? ""}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    zaloUserId: event.currentTarget.value,
                  }))
                }
                className="min-h-touch rounded-md border border-border-default bg-surface-raised px-8"
              />
            </label>
            <fieldset className="flex flex-wrap gap-12">
              <legend className="mb-8 text-sm font-medium">
                Giờ yên lặng (múi giờ {preferences.timeZone})
              </legend>
              <label className="grid gap-4 text-sm">
                Bắt đầu
                <input
                  type="time"
                  value={preferences.quietStart ?? ""}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      quietStart: event.currentTarget.value,
                    }))
                  }
                  className="min-h-touch rounded-md border border-border-default bg-surface-raised px-8"
                />
              </label>
              <label className="grid gap-4 text-sm">
                Kết thúc
                <input
                  type="time"
                  value={preferences.quietEnd ?? ""}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      quietEnd: event.currentTarget.value,
                    }))
                  }
                  className="min-h-touch rounded-md border border-border-default bg-surface-raised px-8"
                />
              </label>
            </fieldset>
            {error ? (
              <p role="alert" className="text-sm text-status-danger">
                {error}
              </p>
            ) : null}
            {saved ? <p role="status">Đã lưu cài đặt thông báo.</p> : null}
            <Button type="submit" variant="primary" loading={saving}>
              Lưu tùy chọn kênh
            </Button>
          </fieldset>
        </form>
      </Card>

      <Card className="p-16 sm:p-24">
        <CardTitle as="h2">Lịch sử gửi thông báo</CardTitle>
        {deliveries.length ? (
          <ul className="mt-12 divide-y divide-border-default">
            {deliveries.map((delivery) => (
              <li key={delivery.id} className="py-8 text-sm">
                <span>
                  {delivery.notification.type} · {delivery.channel} ·{" "}
                  {delivery.status === "sent"
                    ? "Đã gửi"
                    : delivery.status === "failed"
                      ? "Thất bại"
                      : delivery.status === "processing"
                        ? "Đang gửi"
                        : "Đang chờ"}
                </span>
                {delivery.lastError ? (
                  <span className="ml-8 text-status-danger">
                    ({delivery.lastError})
                  </span>
                ) : null}
                <time
                  className="ml-8 text-text-secondary"
                  dateTime={delivery.sentAt ?? delivery.createdAt}
                >
                  {new Date(
                    delivery.sentAt ?? delivery.createdAt,
                  ).toLocaleString("vi-VN")}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-8 text-sm text-text-secondary">
            Chưa có lịch sử gửi kênh ngoài.
          </p>
        )}
      </Card>
    </div>
  );
}
