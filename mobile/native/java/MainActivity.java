package com.amitoj.easycut;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UpdaterPlugin.class); // in-app updates (EasyCutUpdater)
        registerPlugin(MediaPlugin.class); // native Android photo/video document picker
        super.onCreate(savedInstanceState);
    }
}
