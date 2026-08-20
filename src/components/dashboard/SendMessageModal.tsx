"use client";

import React, { useState } from "react";
import { MessageSquare, Send, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface SendMessageModalProps {
    sessionId: string;
    userName: string;
    mediaTitle: string;
}

const CANNED_MESSAGES = [
    { label: "⚠️ Maintenance imminente", text: "Le serveur va redémarrer dans 5 minutes pour une courte maintenance." },
    { label: "🚀 Passer en Direct Play", text: "Merci de passer la qualité en 'Original' (Direct Play) pour éviter le transcodage processeur." },
    { label: "🍿 Bon visionnage", text: "Bon visionnage sur Jellyfin ! Profitez bien de votre séance." },
];

export function SendMessageModal({ sessionId, userName, mediaTitle }: SendMessageModalProps) {
    const [open, setOpen] = useState(false);
    const [header, setHeader] = useState("Message de l'administrateur");
    const [message, setMessage] = useState("");
    const [timeoutSeconds, setTimeoutSeconds] = useState(10);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
    const [errorText, setErrorText] = useState("");

    const handleSend = async () => {
        if (!message.trim()) return;

        setLoading(true);
        setStatus("idle");
        setErrorText("");

        try {
            const res = await fetch("/api/jellyfin/send-message", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sessionId,
                    header: header.trim() || "Message de l'administrateur",
                    message: message.trim(),
                    timeoutMs: timeoutSeconds * 1000,
                }),
            });

            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                setStatus("success");
                setTimeout(() => {
                    setOpen(false);
                    setStatus("idle");
                    setMessage("");
                }, 1500);
            } else {
                setStatus("error");
                setErrorText(data.error || "Erreur lors de l'envoi du message.");
            }
        } catch {
            setStatus("error");
            setErrorText("Erreur réseau.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex items-center justify-center p-1.5 ml-1 hover:bg-primary/20 text-primary rounded-md transition-colors opacity-70 hover:opacity-100"
                title={`Envoyer un message à ${userName}`}
            >
                <MessageSquare className="w-4 h-4" />
            </button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-foreground">
                            <MessageSquare className="h-5 w-5 text-primary" />
                            Envoyer un message à {userName}
                        </DialogTitle>
                        <DialogDescription>
                            Ce message apparaîtra immédiatement en pop-up sur l&apos;écran de l&apos;utilisateur ({mediaTitle}).
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {/* Quick Canned Messages */}
                        <div>
                            <span className="text-xs font-semibold text-muted-foreground block mb-1.5">
                                Messages rapides :
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                                {CANNED_MESSAGES.map((canned, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => setMessage(canned.text)}
                                        className="text-xs bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground px-2.5 py-1 rounded-md border border-border transition-colors text-left"
                                    >
                                        {canned.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Title / Header */}
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">Titre du pop-up</label>
                            <Input
                                value={header}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHeader(e.target.value)}
                                placeholder="Message de l'administrateur"
                                className="text-sm bg-background border-border"
                            />
                        </div>

                        {/* Message body */}
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">Texte du message</label>
                            <textarea
                                value={message}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)}
                                placeholder="Écrivez votre message..."
                                rows={3}
                                className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                            />
                        </div>

                        {/* Display duration */}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Durée d&apos;affichage à l&apos;écran :</span>
                            <div className="flex items-center gap-1">
                                {[5, 10, 30].map((sec) => (
                                    <button
                                        key={sec}
                                        type="button"
                                        onClick={() => setTimeoutSeconds(sec)}
                                        className={`px-2 py-0.5 rounded text-xs border ${
                                            timeoutSeconds === sec
                                                ? "bg-primary text-primary-foreground border-primary font-bold"
                                                : "bg-muted text-muted-foreground border-border"
                                        }`}
                                    >
                                        {sec}s
                                    </button>
                                ))}
                            </div>
                        </div>

                        {status === "success" && (
                            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 shrink-0" />
                                <span>Message transmis avec succès à Jellyfin !</span>
                            </div>
                        )}

                        {status === "error" && (
                            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span>{errorText}</span>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                            Annuler
                        </Button>
                        <Button
                            onClick={handleSend}
                            disabled={!message.trim() || loading || status === "success"}
                            className="gap-1.5"
                        >
                            {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Send className="w-4 h-4" />
                            )}
                            <span>Envoyer</span>
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
