package com.kuhai.mandala;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ClipboardImagePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
